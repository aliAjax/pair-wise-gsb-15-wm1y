import type {Disposition,FlowEdge,FlowNode,ImpactConflict,ImpactInstance,ImpactReport,Instance,InstancePhase,RuleSnapshot,Version} from '../types';
export type {ImpactReport} from '../types';

export const NOW='2026-07-11 16:35';

/** 由节点配置派生人类可读的规则摘要 */
export function ruleSummary(n:FlowNode):string{
  const c=n.data.config;
  switch(n.type){
    case 'start': return c.ok?'流程入口已启用':'流程入口未启用';
    case 'end': return c.ok?'流程正常结束':'流程结束未配置';
    case 'form':{
      const fs=(c.fields||[]) as {label:string;required:boolean}[];
      return fs.length?`收集 ${fs.length} 个字段（${fs.filter(f=>f.required).length} 个必填）：${fs.map(f=>f.label).join('、')}`:'未配置表单字段';
    }
    case 'approval':{
      if(!c.approverSource) return '审批人未配置';
      const who=c.approverSource==='固定角色'&&c.role?`固定角色：${c.role}`:c.approverSource;
      return `审批人：${who}${c.instruction?'；含审批说明':'；无审批说明'}`;
    }
    case 'condition':{
      if(!c.ruleType) return '分支规则未配置';
      const fieldMap:Record<string,string>={amount:'申请金额',department:'部门',attachment:'附件'};
      const field=fieldMap[c.ruleType]||c.ruleType;
      if(c.operator==='为空') return `当「${field}」为空时走满足分支，否则走其他分支`;
      return `当「${field}」${c.operator==='='?'=':'>'} ${Number(c.value||0).toLocaleString()} 走满足分支，否则走其他分支`;
    }
    case 'automation': return c.action?`自动执行：${c.action}`:'本地动作未配置';
    case 'notify': return c.targets?`通知 ${c.targets}${c.template?`，模板「${c.template}」`:''}`:'通知对象未配置';
    default: return JSON.stringify(c);
  }
}

export function freezeRules(nodes:FlowNode[]):RuleSnapshot[]{
  return nodes.map(n=>({nodeId:n.id,nodeLabel:n.data.label,nodeType:n.type,rule:ruleSummary(n)}));
}

/** 实例已进入审批：当前停留在人工审批节点 */
export function phaseOf(ins:Instance):InstancePhase{
  if(ins.status==='abnormal'||ins.status==='timeout') return 'exception';
  if(ins.status!=='running') return 'exception';
  return ins.currentNode.includes('审批')?'approval':'running';
}

/** 各阶段允许的处置：运行中可升级/保留/终止；审批中、异常只能保留旧快照/终止 */
export function allowedDispositions(phase:InstancePhase):Disposition[]{
  return phase==='running'?['upgrade','retain','terminate']:['retain','terminate'];
}

const kindText={added:'新增节点',removed:'移除节点',changed:'规则变更'} as const;
const edgeKey=(e:{source:string;target:string;label?:string})=>`${e.source}>${e.target}>${e.label||''}`;

/**
 * 发布影响预检：比对草稿与上一冻结快照的节点新增/移除/配置变化，
 * 为每个运行中、审批中或异常的实例生成冲突清单（流程→实例→节点→规则）。
 */
export function buildImpact(wfId:string,draftNodes:FlowNode[],draftEdges:FlowEdge[],base:Version|undefined,allInstances:Instance[]):ImpactReport{
  const oldNodes=base?.nodes??[];
  const added=draftNodes.filter(n=>!oldNodes.some(o=>o.id===n.id));
  const removed=oldNodes.filter(o=>!draftNodes.some(n=>n.id===o.id));
  const changed=draftNodes.flatMap(n=>{
    const o=oldNodes.find(x=>x.id===n.id);
    if(!o||JSON.stringify(o.data.config)===JSON.stringify(n.data.config)) return [];
    const rb=base?.rules?.find(r=>r.nodeId===n.id)?.rule??ruleSummary(o);
    return [{node:n,ruleBefore:rb,ruleAfter:ruleSummary(n)}];
  });
  const oldEdges=base?.edges??[];
  const edgesAdded=base?draftEdges.filter(e=>!oldEdges.some(o=>edgeKey(o)===edgeKey(e))):draftEdges.slice();
  const edgesRemoved=base?oldEdges.filter(e=>!draftEdges.some(n=>edgeKey(n)===edgeKey(e))):[];

  const active=allInstances.filter(i=>i.workflowId===wfId&&['running','abnormal','timeout'].includes(i.status));
  const affected:ImpactInstance[]=active.map(ins=>{
    const phase=phaseOf(ins);
    const conflicts:ImpactConflict[]=[];
    const push=(nodeId:string,nodeLabel:string,nodeType:FlowNode['type'],kind:ImpactConflict['kind'],rb:string,ra:string)=>{
      conflicts.push({instanceId:ins.id,nodeId,nodeLabel,nodeType,kind,reached:ins.currentNode===nodeLabel,ruleBefore:rb,ruleAfter:ra,detail:kindText[kind]});
    };
    added.forEach(n=>push(n.id,n.data.label,n.type,'added','—（旧版本无此节点）',ruleSummary(n)));
    removed.forEach(o=>push(o.id,o.data.label,o.type,'removed',ruleSummary(o),'—（新版本已移除）'));
    changed.forEach(ch=>{
      // 实例已经走过或正停留在被改节点时，该规则才构成执行冲突
      const passed=ins.timeline.some(t=>t.title===ch.node.data.label)||ins.currentNode===ch.node.data.label;
      if(passed) push(ch.node.id,ch.node.data.label,ch.node.type,'changed',ch.ruleBefore,ch.ruleAfter);
    });
    return {instance:ins,phase,allowed:allowedDispositions(phase),conflicts};
  }).filter(x=>x.conflicts.length>0);

  return {baseVersion:base?.version??null,nextVersion:(base?.version??0)+1,added,removed,changed,edgesAdded,edgesRemoved,affected};
}
