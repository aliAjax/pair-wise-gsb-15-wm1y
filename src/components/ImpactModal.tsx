import {AlertTriangle,ArrowRight,CheckCircle2,GitCompare,MinusCircle,PlusCircle,Send,Wand2,X} from 'lucide-react';
import type {ReactNode} from 'react';
import {useAppStore} from '../store/useAppStore';
import type {Disposition,ImpactItem,NodeChange} from '../types';
const dispositionText:Record<Disposition,string>={migrate:'切到新版本','keep-snapshot':'保留旧快照',terminate:'终止实例'};
const categoryText:Record<ImpactItem['category'],string>={running:'运行中',approval:'审批中',abnormal:'异常/超时'};
const allDispositions:Disposition[]=['migrate','keep-snapshot','terminate'];
function DiffCol({title,icon,items,empty}:{title:string;icon:ReactNode;items:NodeChange[];empty:string}){
 return <div className="diff-col"><h4>{icon}{title}<em>{items.length}</em></h4>{items.length?items.map(n=><div key={n.id} className="diff-node"><b>{n.label}</b><small>{n.type.toUpperCase()} 节点</small>{n.changes.length>0&&<ul>{n.changes.map(c=><li key={c.key}><span>{c.key}</span>{c.from} → {c.to}</li>)}</ul>}</div>):<p className="diff-empty">{empty}</p>}</div>;
}
export function ImpactModal(){
 const report=useAppStore(s=>s.impact),setDisposition=useAppStore(s=>s.setDisposition),applyRecommended=useAppStore(s=>s.applyRecommended),closeImpact=useAppStore(s=>s.closeImpact),confirmPublish=useAppStore(s=>s.confirmPublish),setDraftReason=useAppStore(s=>s.setDraftReason);
 const w=useAppStore(s=>s.workflows.find(x=>x.id===s.impact?.workflowId));
 if(!report||!w) return null;
 const done=report.items.filter(i=>i.decision).length,pending=report.items.length-done;
 const needReason=!!w.requiresReason,reason=w.draftReason?.trim();
 const blocked=pending>0||(needReason&&!reason);
 return <div className="impact-backdrop"><div className="impact-modal" data-testid="impact-report">
  <div className="impact-head"><div><small>发布影响预检 · {report.createdAt}</small><h2><GitCompare/>{report.workflowName}<span className="version-jump">v{report.baseVersion} <ArrowRight/> v{report.targetVersion}</span></h2></div><button className="icon-btn" aria-label="关闭预检" onClick={closeImpact}><X/></button></div>
  <div className="impact-body">
   <section><h3>规则与结构比对（草稿 vs 已冻结快照 v{report.baseVersion}）</h3><div className="diff-cols" data-testid="impact-diff">
    <DiffCol title="新增节点" icon={<PlusCircle/>} items={report.added} empty="无新增节点"/>
    <DiffCol title="移除节点" icon={<MinusCircle/>} items={report.removed} empty="无移除节点"/>
    <DiffCol title="配置变化" icon={<AlertTriangle/>} items={report.changed} empty="无配置变化"/>
   </div></section>
   <section><div className="impact-list-head"><h3>受影响实例清单<em data-testid="impact-count">{report.items.length}</em></h3>{report.items.length>0&&<button className="secondary mini" data-testid="apply-recommended" onClick={applyRecommended}><Wand2/>按建议全部处置</button>}</div>
    {report.items.length?<table className="impact-table"><thead><tr><th>实例</th><th>申请人</th><th>类别</th><th>当前节点</th><th>执行版本</th><th>冲突（节点 / 规则）</th><th>处置方式</th></tr></thead><tbody>
     {report.items.map(i=><tr key={i.instanceId} data-testid="impact-instance-row" className={i.decision?'resolved':''}>
      <td><b>{i.instanceId}</b></td><td>{i.applicant}</td><td><span className={'impact-cat '+i.category}>{categoryText[i.category]}</span></td><td>{i.currentNode}</td><td>v{i.workflowVersion}</td>
      <td className="impact-rules">{i.impacts.map((x,k)=><small key={k}>{x}</small>)}</td>
      <td><select aria-label={'处置 '+i.instanceId} value={i.decision||''} onChange={e=>setDisposition(i.instanceId,e.target.value as Disposition)}>
       <option value="" disabled>请选择</option>
       {allDispositions.map(d=><option key={d} value={d} disabled={!i.allowed.includes(d)}>{dispositionText[d]}{i.allowed.includes(d)?'':'（不允许）'}</option>)}
      </select>{i.decision&&<CheckCircle2 className="done-icon"/>}</td>
     </tr>)}
    </tbody></table>:<p className="diff-empty" data-testid="no-impact">本次发布没有运行中的受影响实例</p>}
   </section>
   {needReason&&<section className="reason-box" data-testid="reason-box"><h3>变更原因（撤回后必填）</h3><input data-testid="draft-reason-input" aria-label="变更原因" value={w.draftReason||''} onChange={e=>setDraftReason(e.target.value)} placeholder="说明本次撤回后重新修改并发布的原因"/></section>}
  </div>
  <div className="impact-foot"><span className={blocked?'pending-text':'ok-text'}>{pending>0?`还有 ${pending} 个实例未处置，逐项处置后才能发布`:needReason&&!reason?'请填写变更原因':'全部实例已处置，可以发布'}</span><span className="spacer"/><button className="secondary" onClick={closeImpact}>取消</button><button data-testid="confirm-publish" disabled={blocked} onClick={confirmPublish}><Send/>确认发布 v{report.targetVersion}</button></div>
 </div></div>;
}
