import {create} from 'zustand';
import {persist} from 'zustand/middleware';
import {workflows as seed} from '../../mock-data/workflows';
import {instances as seedInstances} from '../../mock-data/instances';
import type {Disposition,FlowEdge,FlowNode,ValidationIssue,Workflow} from '../types';
import {NOW,buildImpact,freezeRules,type ImpactReport} from '../lib/impact';

const clone=<T,>(x:T):T=>JSON.parse(JSON.stringify(x));

/** 首次装载时给历史发布快照补冻结规则，使其满足“规则快照”模型 */
function prepareSeed():Workflow[]{
  return clone(seed).map(w=>({...w,versions:w.versions.map(v=>({...v,rules:v.rules??freezeRules(v.nodes)}))}));
}

const validate=(w:Workflow):ValidationIssue[]=>{
  const issues:ValidationIssue[]=[];
  if(!w.nodes.some(n=>n.type==='end')) issues.push({nodeId:w.nodes[0]?.id||'flow',level:'error',message:'流程缺少结束节点'});
  const linked=new Set(w.edges.flatMap(e=>[e.source,e.target]));
  w.nodes.filter(n=>n.type!=='start'&&n.type!=='end'&&!linked.has(n.id)).forEach(n=>issues.push({nodeId:n.id,level:'error',message:'必经节点不能孤立'}));
  w.nodes.forEach(n=>{
    if(n.type==='condition'&&!n.data.config.ruleType)issues.push({nodeId:n.id,level:'error',message:'条件分支规则未配置'});
    if(n.type==='approval'&&!n.data.config.approverSource)issues.push({nodeId:n.id,level:'error',message:'审批人不能为空'});
  });
  return issues;
};

interface State{
  workflows:Workflow[];instances:typeof seedInstances;currentId:string;selectedNodeId:string|null;issues:ValidationIssue[];toast:string;
  setCurrent:(id:string)=>void;selectNode:(id:string|null)=>void;
  updateNodes:(nodes:FlowNode[])=>void;updateEdges:(edges:FlowEdge[])=>void;updateConfig:(id:string,config:Record<string,any>)=>void;
  runValidation:()=>ValidationIssue[];
  /** 发布影响预检：返回冲突报告；无差异时直接发布并返回 null */
  publishCheck:()=>ImpactReport|null;
  /** 逐项处置后确认发布 */
  confirmPublish:(dispositions:Record<string,Disposition>)=>void;
  /** 撤回已发布版本：回到上一快照 */
  withdraw:(reason:string)=>void;
  /** 撤回后新建带原因草稿，解除编辑冻结 */
  beginDraft:(reason:string)=>void;
  save:(reason?:string)=>void;create:()=>string;copy:(id:string)=>void;archive:(id:string)=>void;restore:(v:number)=>void;clearToast:()=>void;
}

export const useAppStore=create<State>()(persist((set,get)=>({
  workflows:prepareSeed(),
  instances:clone(seedInstances),
  currentId:'wf-1',selectedNodeId:null,issues:[],toast:'',
  setCurrent:id=>set({currentId:id,selectedNodeId:null,issues:[]}),
  selectNode:id=>set({selectedNodeId:id}),
  updateNodes:nodes=>set(s=>{
    const w=s.workflows.find(x=>x.id===s.currentId);
    if(w?.needDraftReason&&!w.draftReason) return {toast:'流程已撤回，请先新建带变更原因的草稿'};
    return {workflows:s.workflows.map(w=>w.id===s.currentId?{...w,nodes}:w)};
  }),
  updateEdges:edges=>set(s=>{
    const w=s.workflows.find(x=>x.id===s.currentId);
    if(w?.needDraftReason&&!w.draftReason) return {toast:'流程已撤回，请先新建带变更原因的草稿'};
    return {workflows:s.workflows.map(w=>w.id===s.currentId?{...w,edges}:w)};
  }),
  updateConfig:(id,config)=>set(s=>{
    const w=s.workflows.find(x=>x.id===s.currentId);
    if(w?.needDraftReason&&!w.draftReason) return {toast:'流程已撤回，请先新建带变更原因的草稿'};
    return {workflows:s.workflows.map(w=>w.id===s.currentId?{...w,nodes:w.nodes.map(n=>n.id===id?{...n,data:{...n.data,config:{...n.data.config,...config},state:'configuring'}}:n)}:w)};
  }),
  runValidation:()=>{
    const w=get().workflows.find(x=>x.id===get().currentId)!;
    const issues=validate(w);
    set(s=>({issues,workflows:s.workflows.map(x=>x.id===w.id?{...x,nodes:x.nodes.map(n=>({...n,data:{...n.data,state:issues.some(i=>i.nodeId===n.id)?'invalid':'valid'}}))}:x),toast:issues.length?`发现 ${issues.length} 个问题`:'校验通过'}));
    return issues;
  },
  publishCheck:()=>{
    const s=get(),w=s.workflows.find(x=>x.id===s.currentId)!;
    const base=[...w.versions].sort((a,b)=>b.version-a.version)[0];
    const report=buildImpact(w.id,clone(w.nodes),clone(w.edges),base,s.instances);
    const noDiff=report.added.length===0&&report.removed.length===0&&report.changed.length===0&&report.edgesAdded.length===0&&report.edgesRemoved.length===0;
    if(noDiff){
      // 结构与规则均无变化：无受影响实例，直接形成发布记录
      get().confirmPublish({});
      return null;
    }
    return report;
  },
  confirmPublish:dispositions=>set(s=>{
    const w=s.workflows.find(x=>x.id===s.currentId)!;
    const next=w.version+1;
    const frozen={version:next,createdAt:NOW,note:w.draftReason?`变更草稿发布：${w.draftReason}`:'发布最新审批配置',nodes:clone(w.nodes),edges:clone(w.edges),rules:freezeRules(w.nodes),
      log:Object.entries(dispositions).map(([instanceId,a])=>({instanceId,action:a,at:NOW}))};
    const instances=s.instances.map(ins=>{
      if(ins.workflowId!==w.id) return ins;
      const d=dispositions[ins.id];
      if(d==='upgrade') return {...ins,version:next};
      if(d==='terminate') return {...ins,status:'terminated' as const,duration:'已终止',timeline:[...ins.timeline,{title:'流程终止',time:NOW,status:'terminated'}]};
      return ins; // retain / 未受影响（completed）：维持绑定旧快照
    });
    return {instances,workflows:s.workflows.map(x=>x.id===w.id?{
      ...x,status:'published',version:next,publishedAt:NOW,updatedAt:NOW,
      versions:[...x.versions,frozen],needDraftReason:false,draftReason:undefined
    }:x),toast:`流程发布成功，已冻结 v${next} 规则快照`};
  }),
  withdraw:reason=>set(s=>{
    const w=s.workflows.find(x=>x.id===s.currentId)!;
    const sorted=[...w.versions].sort((a,b)=>b.version-a.version);
    const top=sorted[0],prev=sorted[1];
    const versions=w.versions.map(v=>v.version===top.version?{...v,withdrawn:true,withdrawReason:reason}:v);
    if(prev){
      // 回到上一快照：草稿画布冻结为上一版结构，等待带原因的新变更草稿
      return {workflows:s.workflows.map(x=>x.id===w.id?{...x,status:'published',version:prev.version,nodes:clone(prev.nodes),edges:clone(prev.edges),versions,needDraftReason:true,draftReason:undefined,updatedAt:NOW}
        :x),toast:`已撤回 v${top.version}，流程回到 v${prev.version} 快照`};
    }
    return {workflows:s.workflows.map(x=>x.id===w.id?{...x,status:'draft',version:0,nodes:[],edges:[],versions,needDraftReason:true,draftReason:undefined,updatedAt:NOW}:x),toast:`已撤回 v${top.version}，无历史快照，流程回到未发布状态`};
  }),
  beginDraft:reason=>set(s=>({workflows:s.workflows.map(w=>w.id===s.currentId?{...w,status:'draft',draftReason:reason,updatedAt:NOW}:w),toast:'已创建带原因的变更草稿，可以继续编辑'})),
  save:reason=>set(s=>({workflows:s.workflows.map(w=>w.id===s.currentId?{...w,status:'draft',updatedAt:NOW,draftReason:reason??w.draftReason}:w),toast:reason?`草稿已保存（变更原因：${reason}）`:'草稿已保存'})),
  create:()=>{
    const id='wf-'+Date.now();
    set(s=>({workflows:[{id,name:'未命名流程',domain:'财务',status:'draft',version:0,editor:'林秋',updatedAt:NOW,abnormalCount:0,nodes:[],edges:[],versions:[]},...s.workflows],currentId:id}));
    return id;
  },
  copy:id=>set(s=>{
    const w=s.workflows.find(x=>x.id===id)!;
    return {workflows:[{...clone(w),id:'wf-'+Date.now(),name:w.name+'（副本）',status:'draft',needDraftReason:false,draftReason:undefined},...s.workflows]};
  }),
  archive:id=>set(s=>({workflows:s.workflows.map(w=>w.id===id?{...w,status:'archived'}:w)})),
  restore:v=>set(s=>({workflows:s.workflows.map(w=>{
    if(w.id!==s.currentId)return w;
    const old=w.versions.find(x=>x.version===v)!;
    return {...w,status:'draft',nodes:clone(old.nodes),edges:clone(old.edges),needDraftReason:false,draftReason:undefined,updatedAt:NOW};
  }),toast:`已恢复 v${v} 为草稿`})),
  clearToast:()=>set({toast:''})
}),{name:'flowdesk-studio-v2',version:2}));

