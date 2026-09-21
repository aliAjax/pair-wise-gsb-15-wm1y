export type WorkflowStatus='draft'|'published'|'archived';
export type NodeKind='start'|'form'|'approval'|'condition'|'automation'|'notify'|'end';
export type NodeState='unconfigured'|'configuring'|'valid'|'invalid';
export type InstanceStatus='abnormal'|'timeout'|'running'|'completed'|'terminated';
/** 发布预检中对单个受影响实例的处置方式 */
export type Disposition='upgrade'|'retain'|'terminate';
/** 实例所处阶段：普通运行中 / 已进入审批 / 异常（含超时） */
export type InstancePhase='running'|'approval'|'exception';
export interface FormField {id:string;label:string;type:'text'|'number'|'amount'|'date'|'select'|'attachment';required:boolean;options?:string[]}
export interface FlowNode {id:string;type:NodeKind;position:{x:number;y:number};data:{label:string;state:NodeState;config:Record<string,any>}}
export interface FlowEdge {id:string;source:string;target:string;label?:string}
/** 发布时冻结的单节点规则快照 */
export interface RuleSnapshot {nodeId:string;nodeLabel:string;nodeType:NodeKind;rule:string}
/** 发布记录中每个实例的处置留痕 */
export interface ReleaseAction {instanceId:string;action:Disposition;at:string}
export interface Version {version:number;createdAt:string;note:string;nodes:FlowNode[];edges:FlowEdge[];rules?:RuleSnapshot[];withdrawn?:boolean;withdrawReason?:string;log?:ReleaseAction[]}
export interface Workflow {id:string;name:string;domain:string;status:WorkflowStatus;version:number;editor:string;updatedAt:string;publishedAt?:string;abnormalCount:number;nodes:FlowNode[];edges:FlowEdge[];versions:Version[];
  /** 撤回后必须先新建带原因草稿才能继续改动 */needDraftReason?:boolean;draftReason?:string}
export interface Instance {id:string;workflowId:string;applicant:string;domain:string;currentNode:string;status:InstanceStatus;submittedAt:string;duration:string;risk:'high'|'medium'|'low';timeline:{title:string;time:string;status:string}[];
  /** 实例实际执行（绑定）的已冻结发布版本 */version:number}
export interface ValidationIssue {nodeId:string;level:'error'|'warning';message:string}
/** 实例级冲突：定位到流程、实例、节点、规则四个维度 */
export interface ImpactConflict {instanceId:string;nodeId:string;nodeLabel:string;nodeType:NodeKind;kind:'added'|'removed'|'changed';reached:boolean;ruleBefore:string;ruleAfter:string;detail:string}
export interface ImpactInstance {instance:Instance;phase:InstancePhase;allowed:Disposition[];conflicts:ImpactConflict[]}
export interface ChangedNode {node:FlowNode;ruleBefore:string;ruleAfter:string}
export interface ImpactReport {baseVersion:number|null;nextVersion:number;added:FlowNode[];removed:FlowNode[];changed:ChangedNode[];edgesAdded:FlowEdge[];edgesRemoved:FlowEdge[];affected:ImpactInstance[]}
