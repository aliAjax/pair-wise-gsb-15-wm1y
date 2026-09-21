export type WorkflowStatus='draft'|'published'|'archived';
export type NodeKind='start'|'form'|'approval'|'condition'|'automation'|'notify'|'end';
export type NodeState='unconfigured'|'configuring'|'valid'|'invalid';
export interface FormField {id:string;label:string;type:'text'|'number'|'amount'|'date'|'select'|'attachment';required:boolean;options?:string[]}
export interface FlowNode {id:string;type:NodeKind;position:{x:number;y:number};data:{label:string;state:NodeState;config:Record<string,any>}}
export interface FlowEdge {id:string;source:string;target:string;label?:string}
export interface Version {version:number;createdAt:string;note:string;nodes:FlowNode[];edges:FlowEdge[]}
export type Disposition='migrate'|'keep-snapshot'|'terminate';
export interface PublishRecord {version:number;publishedAt:string;note:string;reason?:string;frozen:boolean;withdrawn?:boolean;withdrawnAt?:string;dispositions:{instanceId:string;decision:Disposition}[]}
export interface Workflow {id:string;name:string;domain:string;status:WorkflowStatus;version:number;editor:string;updatedAt:string;publishedAt?:string;abnormalCount:number;nodes:FlowNode[];edges:FlowEdge[];versions:Version[];records:PublishRecord[];requiresReason?:boolean;draftReason?:string}
export type InstanceStatus='abnormal'|'timeout'|'running'|'completed'|'terminated';
export interface Instance {id:string;workflowId:string;applicant:string;domain:string;currentNode:string;status:InstanceStatus;submittedAt:string;duration:string;risk:'high'|'medium'|'low';workflowVersion:number;timeline:{title:string;time:string;status:string}[]}
export interface RuleChange {key:string;from:string;to:string}
export interface NodeChange {id:string;label:string;type:NodeKind;changes:RuleChange[]}
export type ImpactCategory='running'|'approval'|'abnormal';
export interface ImpactItem {instanceId:string;applicant:string;status:InstanceStatus;currentNode:string;workflowVersion:number;category:ImpactCategory;allowed:Disposition[];decision?:Disposition;impacts:string[]}
export interface ImpactReport {workflowId:string;workflowName:string;baseVersion:number;targetVersion:number;added:NodeChange[];removed:NodeChange[];changed:NodeChange[];items:ImpactItem[];createdAt:string}
export interface ValidationIssue {nodeId:string;level:'error'|'warning';message:string}
