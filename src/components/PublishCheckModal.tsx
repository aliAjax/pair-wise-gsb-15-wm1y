import {useMemo,useState} from 'react';
import {AlertTriangle,GitBranch,PlusCircle,Shrink,X,XCircle} from 'lucide-react';
import type {Disposition,ImpactReport} from '../types';
import {useAppStore} from '../store/useAppStore';

const phaseLabel={running:'运行中',approval:'审批中',exception:'异常 / 超时'} as const;
const phaseClass={running:'running',approval:'draft',exception:'abnormal'} as const;
const actionLabel:Record<Disposition,string>={upgrade:'切到新版本',retain:'保留旧快照',terminate:'终止实例'};

export function PublishCheckModal({report,onClose}:{report:ImpactReport;onClose:()=>void}){
  const store=useAppStore(),w=store.workflows.find(x=>x.id===store.currentId)!;
  const [picks,setPicks]=useState<Record<string,Disposition>>({});
  const [active,setActive]=useState(report.affected[0]?.instance.id??null);
  const pending=report.affected.filter(a=>!picks[a.instance.id]);
  const current=report.affected.find(a=>a.instance.id===active)??null;

  const counters=useMemo(()=>({
    upgrade:Object.values(picks).filter(a=>a==='upgrade').length,
    retain:Object.values(picks).filter(a=>a==='retain').length,
    terminate:Object.values(picks).filter(a=>a==='terminate').length
  }),[picks]);

  const choose=(id:string,a:Disposition)=>setPicks(p=>({...p,[id]:a}));
  const confirm=()=>{store.confirmPublish(picks);onClose();};

  return <div className="drawer-backdrop" data-testid="publish-check">
    <div className="publish-modal">
      <header>
        <div><small>发布影响预检</small><h2>{w.name} · v{report.nextVersion}</h2></div>
        <button className="icon-btn" data-testid="publish-check-close" onClick={onClose}><X/></button>
      </header>
      <div className="pc-summary">
        <article className="added"><PlusCircle/><div><small>新增节点</small><b>{report.added.length}</b></div></article>
        <article className="removed"><Shrink/><div><small>移除节点</small><b>{report.removed.length}</b></div></article>
        <article className="changed"><GitBranch/><div><small>配置变化</small><b>{report.changed.length}</b></div></article>
        <article className="edge"><GitBranch/><div><small>连线变化</small><b>{report.edgesAdded.length+report.edgesRemoved.length}</b></div></article>
        <article className="affected"><AlertTriangle/><div><small>受影响实例</small><b>{report.affected.length}</b></div></article>
      </div>
      <div className="pc-change-tags" data-testid="pc-change-tags">
        {report.added.map(n=><span key={'a'+n.id} className="ctag added">＋ {n.data.label}</span>)}
        {report.removed.map(n=><span key={'r'+n.id} className="ctag removed">− {n.data.label}</span>)}
        {report.changed.map(c=><span key={'c'+c.node.id} className="ctag changed">~ {c.node.data.label} 规则变更</span>)}
      </div>
      {report.affected.length===0
        ? <div className="pc-empty">结构有变化但没有运行中、审批中或异常的实例受影响，可直接发布。</div>
        : <div className="pc-body">
          <section className="pc-instances">
            <h3>受影响实例清单 <em data-testid="pc-pending">待处置 {pending.length}</em></h3>
            {report.affected.map(a=>{
              const pick=picks[a.instance.id];
              return <button key={a.instance.id} className={'pc-instance '+(active===a.instance.id?'active':'')} onClick={()=>setActive(a.instance.id)}>
                <div className="pc-instance-top"><b>{a.instance.id}</b><span className={'status '+phaseClass[a.phase]}>{phaseLabel[a.phase]}</span>{pick&&<em className={'pick-badge '+pick}>{actionLabel[pick]}</em>}</div>
                <small>{a.instance.applicant} · 当前 {a.instance.currentNode} · {a.conflicts.length} 项冲突</small>
                {!pick&&<i className="undone">未处置</i>}
              </button>;
            })}
          </section>
          <section className="pc-detail">
            {current&&<>
              <h3>{current.instance.id} 的处置</h3>
              <p className="pc-hint">
                {current.phase==='running'
                  ? '该实例仍在普通节点运行，可切换到新版本继续执行，也可保留旧快照或终止。'
                  : current.phase==='approval'
                    ? '该实例已进入人工审批，不能切换版本，只能保留旧快照继续审批或终止。'
                    : '该实例处于异常 / 超时状态，不能切换版本，只能保留旧快照或终止。'}
              </p>
              <div className="pc-actions">
                {(['upgrade','retain','terminate'] as Disposition[]).map(a=>{
                  const enabled=current.allowed.includes(a);
                  return <button key={a} data-testid={'action-'+a} disabled={!enabled} className={picks[current.instance.id]===a?'sel':''} onClick={()=>enabled&&choose(current.instance.id,a)}>
                    {a==='upgrade'?'切到新版本':a==='retain'?'保留旧快照':'终止实例'}
                    {!enabled&&<small>（{current.phase==='approval'?'已进入审批':'异常状态'}不可用）</small>}
                  </button>;
                })}
              </div>
              <h4>冲突明细：流程 / 实例 / 节点 / 规则</h4>
              <table className="pc-conflicts" data-testid="pc-conflicts">
                <thead><tr><th>流程</th><th>实例</th><th>节点</th><th>规则变化</th></tr></thead>
                <tbody>{current.conflicts.map((c,k)=><tr key={k}>
                  <td>{w.name}</td><td>{current.instance.id}{c.reached&&<em className="here">实例停留在此节点</em>}</td>
                  <td><span className={'kdot '+c.kind}/><b>{c.nodeLabel}</b><small>{c.detail}</small></td>
                  <td><span className="rule-old">{c.ruleBefore}</span><span className="rule-arrow">→</span><span className="rule-new">{c.ruleAfter}</span></td>
                </tr>)}</tbody>
              </table>
            </>}
          </section>
        </div>}
      <footer>
        <div className="pc-foot-stats">
          {pending.length>0
            ? <span className="pc-warn" data-testid="pc-warn"><XCircle/>还有 {pending.length} 个实例未逐项处置，不能发布</span>
            : <span className="pc-ok">已全部处置：{counters.upgrade} 个升级 · {counters.retain} 个保留旧快照 · {counters.terminate} 个终止</span>}
        </div>
        <button className="secondary" onClick={onClose}>取消</button>
        <button data-testid="publish-confirm" disabled={pending.length>0} onClick={confirm}>确认发布 v{report.nextVersion}</button>
      </footer>
    </div>
  </div>;
}
