import {create} from 'zustand';
import {persist} from 'zustand/middleware';
import {workflows as seed} from '../../mock-data/workflows';
import {instances as seedInstances} from '../../mock-data/instances';
import type {Disposition,FlowEdge,FlowNode,ImpactItem,ImpactReport,Instance,NodeChange,PublishRecord,RuleChange,ValidationIssue,Version,Workflow} from '../types';

const clone=<T,>(x:T):T=>JSON.parse(JSON.stringify(x));
const NOW='2026-07-11 16:35';

const validate=(w:Workflow):ValidationIssue[]=>{const issues:ValidationIssue[]=[]; if(!w.nodes.some(n=>n.type==='end')) issues.push({nodeId:w.nodes[0]?.id||'flow',level:'error',message:'流程缺少结束节点'}); const linked=new Set(w.edges.flatMap(e=>[e.source,e.target])); w.nodes.filter(n=>n.type!=='start'&&n.type!=='end'&&!linked.has(n.id)).forEach(n=>issues.push({nodeId:n.id,level:'error',message:'必经节点不能孤立'})); w.nodes.forEach(n=>{if(n.type==='condition'&&!n.data.config.ruleType)issues.push({nodeId:n.id,level:'error',message:'条件分支规则未配置'}); if(n.type==='approval'&&!n.data.config.approverSource)issues.push({nodeId:n.id,level:'error',message:'审批人不能为空'});}); return issues};

// 当前生效的已冻结规则快照（版本号不超过 workflow.version 的最新版本）
const snapshotOf=(w:Workflow):Version|undefined=>[...w.versions].sort((a,b)=>b.version-a.version).find(v=>v.version<=w.version);
const nextVersion=(w:Workflow)=>Math.max(w.version,0,...w.versions.map(v=>v.version))+1;
const fmt=(v:any)=>v===undefined||v===null||v===''?'（空）':typeof v==='object'?JSON.stringify(v):String(v);

// 比对草稿与已发布快照：节点新增、移除与配置（规则）变化
const diffGraphs=(base:FlowNode[],next:FlowNode[])=>{
 const added:NodeChange[]=next.filter(x=>!base.some(b=>b.id===x.id)).map(x=>({id:x.id,label:x.data.label,type:x.type,changes:[]}));
 const removed:NodeChange[]=base.filter(b=>!next.some(x=>x.id===b.id)).map(b=>({id:b.id,label:b.data.label,type:b.type,changes:[]}));
 const changed:NodeChange[]=next.flatMap(x=>{
  const old=base.find(b=>b.id===x.id);
  if(!old) return [];
  const keys=Array.from(new Set([...Object.keys(old.data.config||{}),...Object.keys(x.data.config||{})]));
  const changes:RuleChange[]=keys.filter(k=>JSON.stringify(old.data.config?.[k])!==JSON.stringify(x.data.config?.[k])).map(k=>({key:k,from:fmt(old.data.config?.[k]),to:fmt(x.data.config?.[k])}));
  return changes.length||old.data.label!==x.data.label?[{id:x.id,label:x.data.label,type:x.type,changes}]:[];
 });
 return {added,removed,changed};
};

// 生成发布影响预检报告：结构差异 + 受影响实例清单（含每项允许的处置方式）
const buildReport=(w:Workflow,instances:Instance[]):ImpactReport=>{
 const snap=snapshotOf(w);
 const base=snap?snap.nodes:[];
 const {added,removed,changed}=diffGraphs(base,w.nodes);
 const baseByLabel=new Map(base.map(n=>[n.data.label,n]));
 const changedById=new Map(changed.map(c=>[c.id,c]));
 const removedById=new Map(removed.map(r=>[r.id,r]));
 const items:ImpactItem[]=instances.filter(i=>i.workflowId===w.id&&i.status!=='completed'&&i.status!=='terminated').map(i=>{
  const node=baseByLabel.get(i.currentNode);
  const category:ImpactItem['category']=i.status==='abnormal'||i.status==='timeout'?'abnormal':node?.type==='approval'?'approval':'running';
  // 运行中实例可切到新版本；已进入审批或异常的实例只能保留旧快照或终止
  const allowed:Disposition[]=category==='running'?['migrate','keep-snapshot']:['keep-snapshot','terminate'];
  const impacts:string[]=[];
  if(node){
   const rm=removedById.get(node.id); if(rm) impacts.push(`当前节点「${rm.label}」在新版本中被移除`);
   const ch=changedById.get(node.id); if(ch) impacts.push(`当前节点「${ch.label}」规则变更：${ch.changes.map(c=>`${c.key} ${c.from} → ${c.to}`).join('，')}`);
  }else impacts.push(`当前节点「${i.currentNode}」不在已发布快照中`);
  if(!impacts.length) impacts.push('流程版本升级，实例执行定义将切换');
  return {instanceId:i.id,applicant:i.applicant,status:i.status,currentNode:i.currentNode,workflowVersion:i.workflowVersion,category,allowed,impacts};
 });
 return {workflowId:w.id,workflowName:w.name,baseVersion:snap?.version||0,targetVersion:nextVersion(w),added,removed,changed,items,createdAt:NOW};
};

interface State{
 workflows:Workflow[];instances:Instance[];currentId:string;selectedNodeId:string|null;issues:ValidationIssue[];toast:string;impact:ImpactReport|null;
 setCurrent:(id:string)=>void;selectNode:(id:string|null)=>void;updateNodes:(nodes:FlowNode[])=>void;updateEdges:(edges:FlowEdge[])=>void;updateConfig:(id:string,config:Record<string,any>)=>void;
 runValidation:()=>ValidationIssue[];save:()=>void;
 buildImpact:()=>ImpactReport|null;setDisposition:(instanceId:string,decision:Disposition)=>void;applyRecommended:()=>void;closeImpact:()=>void;setDraftReason:(reason:string)=>void;confirmPublish:()=>boolean;
 create:()=>string;copy:(id:string)=>void;archive:(id:string)=>void;restore:(v:number)=>void;withdraw:(id:string)=>void;clearToast:()=>void;
}

export const useAppStore=create<State>()(persist((set,get)=>({
 workflows:clone(seed),instances:clone(seedInstances),currentId:'wf-1',selectedNodeId:null,issues:[],toast:'',impact:null,
 setCurrent:id=>set({currentId:id,selectedNodeId:null,issues:[]}),
 selectNode:id=>set({selectedNodeId:id}),
 updateNodes:nodes=>set(s=>({workflows:s.workflows.map(w=>w.id===s.currentId?{...w,nodes}:w)})),
 updateEdges:edges=>set(s=>({workflows:s.workflows.map(w=>w.id===s.currentId?{...w,edges}:w)})),
 updateConfig:(id,config)=>set(s=>({workflows:s.workflows.map(w=>w.id===s.currentId?{...w,nodes:w.nodes.map(n=>n.id===id?{...n,data:{...n.data,config:{...n.data.config,...config},state:'configuring'}}:n)}:w)})),
 runValidation:()=>{const w=get().workflows.find(x=>x.id===get().currentId)!; const issues=validate(w); set(s=>({issues,workflows:s.workflows.map(x=>x.id===w.id?{...x,nodes:x.nodes.map(n=>({...n,data:{...n.data,state:issues.some(i=>i.nodeId===n.id)?'invalid':'valid'}}))}:x),toast:issues.length?`发现 ${issues.length} 个问题`:'校验通过'}));return issues},
 save:()=>set(s=>({workflows:s.workflows.map(w=>w.id===s.currentId?{...w,status:'draft',updatedAt:'2026-07-11 16:30'}:w),toast:'草稿已保存'})),
 buildImpact:()=>{const s=get();const w=s.workflows.find(x=>x.id===s.currentId); if(!w) return null; const impact=buildReport(w,s.instances); set({impact}); return impact},
 setDisposition:(instanceId,decision)=>set(s=>s.impact?{impact:{...s.impact,items:s.impact.items.map(i=>i.instanceId===instanceId&&i.allowed.includes(decision)?{...i,decision}:i)}}:s),
 applyRecommended:()=>set(s=>s.impact?{impact:{...s.impact,items:s.impact.items.map(i=>({...i,decision:i.category==='running'?'migrate':'keep-snapshot'}))}}:s),
 closeImpact:()=>set({impact:null}),
 setDraftReason:reason=>set(s=>({workflows:s.workflows.map(w=>w.id===s.currentId?{...w,draftReason:reason}:w)})),
 confirmPublish:()=>{
  const s=get(),report=s.impact; if(!report) return false;
  const w=s.workflows.find(x=>x.id===report.workflowId); if(!w) return false;
  if(report.items.some(i=>!i.decision)) return false; // 未逐项处置不得发布
  const reason=w.draftReason?.trim();
  if(w.requiresReason&&!reason) return false; // 撤回后的改动必须填写变更原因
  const next=report.targetVersion;
  const record:PublishRecord={version:next,publishedAt:NOW,note:reason?'撤回后变更发布':'发布最新审批配置',reason:reason||undefined,frozen:true,dispositions:report.items.map(i=>({instanceId:i.instanceId,decision:i.decision!}))};
  set(x=>({
   impact:null,toast:'流程发布成功',
   workflows:x.workflows.map(y=>y.id===w.id?{...y,status:'published',version:next,publishedAt:NOW,updatedAt:NOW,requiresReason:false,draftReason:'',versions:[...y.versions,{version:next,createdAt:NOW,note:record.note,nodes:clone(y.nodes),edges:clone(y.edges)}],records:[...y.records,record]}:y),
   instances:x.instances.map(ins=>{
    const d=report.items.find(i=>i.instanceId===ins.id)?.decision;
    if(!d) return ins;
    if(d==='migrate') return {...ins,workflowVersion:next};
    if(d==='terminate') return {...ins,status:'terminated' as const,currentNode:'已终止',timeline:[...ins.timeline,{title:'发布处置：实例终止',time:'16:35',status:'completed'}]};
    return ins; // keep-snapshot：实例继续绑定旧版本快照
   })
  }));
  return true;
 },
 create:()=>{const id='wf-'+Date.now();set(s=>({workflows:[{id,name:'未命名流程',domain:'财务',status:'draft',version:0,editor:'林秋',updatedAt:'2026-07-11 16:40',abnormalCount:0,nodes:[],edges:[],versions:[],records:[]},...s.workflows],currentId:id}));return id},
 copy:id=>set(s=>{const w=s.workflows.find(x=>x.id===id)!;return{workflows:[{...clone(w),id:'wf-'+Date.now(),name:w.name+'（副本）',status:'draft',records:[],requiresReason:false,draftReason:''},...s.workflows]}}),
 archive:id=>set(s=>({workflows:s.workflows.map(w=>w.id===id?{...w,status:'archived'}:w)})),
 restore:v=>set(s=>({workflows:s.workflows.map(w=>{if(w.id!==s.currentId)return w;const old=w.versions.find(x=>x.version===v)!;return{...w,status:'draft',nodes:clone(old.nodes),edges:clone(old.edges)}}),toast:`已恢复 v${v} 为草稿`})),
 withdraw:id=>set(s=>{
  const w=s.workflows.find(x=>x.id===id);
  if(!w||w.status!=='published') return {toast:'仅已发布流程可撤回'};
  const prev=[...w.versions].sort((a,b)=>b.version-a.version).find(v=>v.version<w.version);
  if(!prev) return {toast:'没有可回退的上一快照'};
  return {workflows:s.workflows.map(x=>x.id===id?{...x,version:prev.version,nodes:clone(prev.nodes),edges:clone(prev.edges),status:'published',updatedAt:NOW,requiresReason:true,records:x.records.map(r=>r.version===w.version&&!r.withdrawn?{...r,withdrawn:true,withdrawnAt:NOW}:r)}:x),toast:`已撤回，回到 v${prev.version} 快照，后续改动需填写变更原因`};
 }),
 clearToast:()=>set({toast:''})
}),{name:'flowdesk-studio',partialize:s=>({workflows:s.workflows,instances:s.instances})}));
