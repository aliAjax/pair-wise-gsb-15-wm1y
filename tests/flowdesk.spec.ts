import {test,expect} from '@playwright/test';

test.describe.serial('FlowDesk 完整链路',()=>{
 test('Dashboard KPI 与最近流程进入编辑器',async({page})=>{await page.goto('/');await expect(page.getByTestId('kpi-grid')).toBeVisible();await expect(page.getByText('流程总数')).toBeVisible();await expect(page.getByText('异常实例',{exact:true}).first()).toBeVisible();await page.getByTestId('recent-workflow').first().click();await expect(page.getByTestId('flow-canvas')).toBeVisible();});

 test('审批配置、保存和双区域校验',async({page})=>{await page.goto('/workflows/wf-1');await page.getByTestId('canvas-node-approval').click();await expect(page.getByTestId('config-panel')).toContainText('审批配置');await page.getByLabel('审批人来源').selectOption({label:'固定角色'});await page.getByTestId('save-node-config').click();await page.getByRole('button',{name:'保存草稿'}).click();await page.getByTestId('validate-button').click();await expect(page.getByTestId('canvas-node-condition')).toHaveClass(/invalid/);await expect(page.getByTestId('issues-panel')).toContainText('条件分支规则未配置');const before=await page.getByTestId('error-count').textContent();expect(Number(before?.match(/\d+/)?.[0])).toBeGreaterThan(0);await page.getByTestId('canvas-node-condition').click();await page.getByLabel('条件字段').selectOption('amount');await page.getByLabel('条件比较值').fill('5000');await page.getByTestId('save-node-config').click();await page.getByTestId('validate-button').click();await expect(page.getByTestId('error-count')).toContainText('0 错误');});

 test('表单预览金额驱动条件分支',async({page})=>{await page.goto('/workflows/wf-1/preview');await expect(page.getByTestId('branch-result')).toContainText('标准分支');await page.getByLabel('申请金额').fill('12000');await expect(page.getByTestId('branch-result')).toContainText('高额分支');});

 test('无结构差异发布直接成功并刷新保持绑定',async({page})=>{await page.goto('/workflows/wf-2');await page.getByTestId('publish-button').click();await expect(page.getByRole('status')).toContainText('发布成功');
   // 发布记录与实例绑定在刷新后保持一致
   await page.reload();await page.goto('/workflows/wf-2/versions');await expect(page.getByTestId('version-compare')).toContainText('冻结规则快照');
   await page.goto('/monitor');await page.getByRole('button',{name:'异常',exact:true}).click();await page.getByTestId('instance-row').first().click();await expect(page.getByTestId('instance-detail')).toBeVisible();await expect(page.getByTestId('bound-version')).toBeVisible();});

 test('发布影响预检：逐项处置前阻止发布',async({page})=>{
   // wf-5 已发布，修改条件阈值产生规则差异
   await page.goto('/workflows/wf-5');
   await page.getByTestId('canvas-node-condition').click();
   await page.getByLabel('条件比较值').fill('9000');
   await page.getByTestId('save-node-config').click();
   await page.getByTestId('publish-button').click();
   const modal=page.getByTestId('publish-check');
   await expect(modal).toBeVisible();
   await expect(modal).toContainText('发布影响预检');
   // 冲突按流程 / 实例 / 节点 / 规则列出
   await expect(page.getByTestId('pc-conflicts')).toContainText('流程');
   await expect(page.getByTestId('pc-conflicts')).toContainText('实例');
   await expect(page.getByTestId('pc-conflicts')).toContainText('节点');
   await expect(page.getByTestId('pc-conflicts')).toContainText('规则变化');
   await expect(page.getByTestId('pc-conflicts')).toContainText('申请金额');
   // 未逐项处置不得发布
   const pending=await page.getByTestId('pc-pending').textContent();
   expect(Number(pending?.match(/\d+/)?.[0])).toBeGreaterThan(0);
   await expect(page.getByTestId('publish-confirm')).toBeDisabled();
   // 处置受影响实例：一个运行中实例切到新版本，一个终止，其余保留旧快照
   const list=page.locator('.pc-instance');
   const totalRows=await list.count();let upgraded=false,terminated=false;
   for(let k=0;k<totalRows;k++){await list.nth(k).click();const up=page.getByTestId('action-upgrade').first();
     if(!upgraded&&await up.isEnabled()){await up.click();upgraded=true;}
     else if(!terminated){await page.getByTestId('action-terminate').first().click();terminated=true;}
     else{await page.getByTestId('action-retain').first().click();}}
   expect(upgraded).toBeTruthy();expect(terminated).toBeTruthy();
   await expect(page.getByTestId('publish-confirm')).toBeEnabled();
   await page.getByTestId('publish-confirm').click();
   await expect(page.getByRole('status')).toContainText('发布成功');
   // 运行监控出现已终止实例
   await page.goto('/monitor');await page.getByRole('button',{name:'已终止',exact:true}).click();
   await expect(page.getByTestId('instance-row').first()).toBeVisible();
 });

 test('审批中 / 异常实例不能切到新版本',async({page})=>{
   await page.goto('/workflows/wf-7');
   await page.getByTestId('canvas-node-condition').click();
   await page.getByLabel('条件比较值').fill('300');
   await page.getByTestId('save-node-config').click();
   await page.getByTestId('publish-button').click();
   await expect(page.getByTestId('publish-check')).toBeVisible();
   // 打开每个受影响实例，审批中/异常的“切到新版本”必须禁用（wf-7 至少 3 个）
   const rows=page.locator('.pc-instance');
   const total=await rows.count();let disabled=0;
   for(let k=0;k<total;k++){await rows.nth(k).click();const up=page.getByTestId('action-upgrade').first();if(await up.isDisabled())disabled++;else await page.getByTestId('action-retain').first().click();}
   expect(disabled).toBeGreaterThanOrEqual(3);
   await page.getByTestId('publish-check-close').click();
 });

 test('异常实例详情、时间线与当前节点高亮',async({page})=>{await page.goto('/monitor');await page.getByRole('button',{name:'异常',exact:true}).click();await page.getByTestId('instance-row').first().click();await expect(page.getByTestId('instance-detail')).toBeVisible();await expect(page.getByTestId('execution-timeline')).toContainText('提交申请');await expect(page.locator('.runtime-highlight')).toHaveCount(1);await expect(page.getByTestId('bound-version')).toContainText(/v\d/);});

 test('版本比较并恢复历史版本',async({page})=>{await page.goto('/workflows/wf-2/versions');await expect(page.getByTestId('version-compare')).toContainText('新增节点');await page.getByTestId('restore-version').click();await expect(page).toHaveURL(/\/workflows\/wf-2$/);await expect(page.getByRole('status')).toContainText('已恢复');await expect(page.getByTestId('flow-canvas')).toBeVisible();});

 test('撤回发布回到上一快照，后续改动必须新建带原因草稿',async({page})=>{
   await page.goto('/workflows/wf-7/versions');
   await page.getByTestId('withdraw-button').click();
   await expect(page.getByTestId('withdraw-dialog')).toBeVisible();
   await expect(page.getByTestId('withdraw-confirm')).toBeDisabled();
   await page.getByTestId('withdraw-reason').fill('阈值配置错误，需要回退后重新调整');
   await page.getByTestId('withdraw-confirm').click();
   await expect(page).toHaveURL(/\/workflows\/wf-7$/);
   await expect(page.getByTestId('draft-gate')).toBeVisible();
   // 画布冻结在上一快照 v1（wf-7 种子当前为 v2）
   await expect(page.locator('.canvas-bar')).toContainText('v1');
   // 不填原因不能开始草稿
   await expect(page.getByTestId('begin-draft')).toBeDisabled();
   await page.getByTestId('draft-reason').fill('新增财务复核节点并下调阈值');
   await page.getByTestId('begin-draft').click();
   await expect(page.getByTestId('draft-gate')).toHaveCount(0);
   await expect(page.getByRole('status')).toContainText('带原因');
   // 撤回标记保留在发布记录上
   await page.goto('/workflows/wf-7/versions');
   await expect(page.getByTestId('withdraw-banner')).toBeVisible();
   await expect(page.getByText('已撤回').first()).toBeVisible();
 });
});

test('1440px 桌面视觉与控制台验证',async({page})=>{
 const errors:string[]=[]; page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 for(const path of ['/','/workflows/wf-1','/monitor']){await page.goto(path);await page.waitForTimeout(250);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);expect(overflow,`${path} 不应横向溢出`).toBeFalsy()}
 await page.goto('/'); await page.screenshot({path:'test-results/dashboard-1440.png',fullPage:true});
 expect(errors,'浏览器 console 不应出现 error').toEqual([]);
});
