import {test,expect} from '@playwright/test';
test.describe.serial('FlowDesk 完整链路',()=>{
 test('Dashboard KPI 与最近流程进入编辑器',async({page})=>{await page.goto('/');await expect(page.getByTestId('kpi-grid')).toBeVisible();await expect(page.getByText('流程总数')).toBeVisible();await expect(page.getByText('异常实例',{exact:true}).first()).toBeVisible();await page.getByTestId('recent-workflow').first().click();await expect(page.getByTestId('flow-canvas')).toBeVisible();});
 test('审批配置、保存和双区域校验',async({page})=>{await page.goto('/workflows/wf-1');await page.getByTestId('canvas-node-approval').click();await expect(page.getByTestId('config-panel')).toContainText('审批配置');await page.getByLabel('审批人来源').selectOption({label:'固定角色'});await page.getByTestId('save-node-config').click();await page.getByRole('button',{name:'保存草稿'}).click();await page.getByTestId('validate-button').click();await expect(page.getByTestId('canvas-node-condition')).toHaveClass(/invalid/);await expect(page.getByTestId('issues-panel')).toContainText('条件分支规则未配置');const before=await page.getByTestId('error-count').textContent();expect(Number(before?.match(/\d+/)?.[0])).toBeGreaterThan(0);await page.getByTestId('canvas-node-condition').click();await page.getByLabel('条件字段').selectOption('amount');await page.getByLabel('条件比较值').fill('5000');await page.getByTestId('save-node-config').click();await page.getByTestId('validate-button').click();await expect(page.getByTestId('error-count')).toContainText('0 错误');});
 test('表单预览金额驱动条件分支',async({page})=>{await page.goto('/workflows/wf-1/preview');await expect(page.getByTestId('branch-result')).toContainText('标准分支');await page.getByLabel('申请金额').fill('12000');await expect(page.getByTestId('branch-result')).toContainText('高额分支');});
 test('发布后列表和总览同步',async({page})=>{await page.goto('/workflows/wf-2');await page.getByTestId('publish-button').click();await expect(page.getByTestId('impact-report')).toBeVisible();await page.getByTestId('apply-recommended').click();await page.getByTestId('confirm-publish').click();await expect(page.getByRole('status')).toContainText('发布成功');await page.getByRole('link',{name:'流程管理'}).click();const row=page.getByTestId('workflow-row').filter({hasText:'采购合同审批'});await expect(row).toContainText('已发布');await expect(row).toContainText('v3');await page.getByRole('link',{name:'总览'}).click();await expect(page.getByTestId('kpi-grid')).toBeVisible();});
 test('异常实例详情、时间线与当前节点高亮',async({page})=>{await page.goto('/monitor');await page.getByRole('button',{name:'异常',exact:true}).click();await page.getByTestId('instance-row').first().click();await expect(page.getByTestId('instance-detail')).toBeVisible();await expect(page.getByTestId('execution-timeline')).toContainText('提交申请');await expect(page.locator('.runtime-highlight')).toHaveCount(1);});
 test('版本比较并恢复历史版本',async({page})=>{await page.goto('/workflows/wf-2/versions');await expect(page.getByTestId('version-compare')).toContainText('新增节点');await page.getByTestId('restore-version').click();await expect(page).toHaveURL(/\/workflows\/wf-2$/);await expect(page.getByRole('status')).toContainText('已恢复');await expect(page.getByTestId('flow-canvas')).toBeVisible();});
});

test.describe.serial('发布影响预检',()=>{
 test('预检比对配置变化，未逐项处置不得发布',async({page})=>{
  await page.goto('/workflows/wf-2');
  await page.getByTestId('canvas-node-condition').click();
  await page.getByLabel('条件比较值').fill('8000');
  await page.getByTestId('save-node-config').click();
  await page.getByTestId('publish-button').click();
  const report=page.getByTestId('impact-report');
  await expect(report).toBeVisible();
  await expect(page.getByTestId('impact-diff')).toContainText('配置变化');
  await expect(page.getByTestId('impact-diff')).toContainText('金额判断');
  await expect(page.getByTestId('impact-diff')).toContainText('5000 → 8000');
  await expect(page.getByTestId('impact-count')).toHaveText('5');
  await expect(page.getByTestId('confirm-publish')).toBeDisabled();
  await expect(page.locator('.pending-text')).toContainText('5 个实例未处置');
  // 异常实例不允许切到新版本
  const abnormalSelect=page.getByLabel('处置 INS-2026-0002');
  await expect(abnormalSelect.locator('option[value=migrate]')).toBeDisabled();
  await abnormalSelect.selectOption('keep-snapshot');
  // 运行中实例逐项切到新版本
  for(const id of ['INS-2026-0026','INS-2026-0038','INS-2026-0050']) await page.getByLabel(`处置 ${id}`).selectOption('migrate');
  await page.getByLabel('处置 INS-2026-0014').selectOption('terminate');
  await expect(page.getByTestId('confirm-publish')).toBeEnabled();
  await page.getByTestId('confirm-publish').click();
  await expect(page.getByRole('status')).toContainText('发布成功');
  // 实例详情显示实际执行版本
  await page.goto('/monitor?instance=INS-2026-0026');
  await expect(page.getByTestId('instance-version')).toContainText('v3');
  await page.goto('/monitor?instance=INS-2026-0002');
  await expect(page.getByTestId('instance-version')).toContainText('v2');
  await expect(page.getByTestId('instance-version')).toContainText('旧快照');
  // 终止实例出现在已终止筛选中
  await page.goto('/monitor');
  await page.getByRole('button',{name:'已终止'}).click();
  await expect(page.getByTestId('instance-row').filter({hasText:'INS-2026-0014'})).toContainText('已终止');
 });
 test('审批中实例只能保留旧快照或终止',async({page})=>{
  await page.goto('/workflows/wf-7');
  await page.getByTestId('publish-button').click();
  await expect(page.getByTestId('impact-report')).toBeVisible();
  const row=page.getByTestId('impact-instance-row').filter({hasText:'INS-2026-0031'});
  await expect(row).toContainText('审批中');
  const select=page.getByLabel('处置 INS-2026-0031');
  await expect(select.locator('option[value=migrate]')).toBeDisabled();
  await expect(select.locator('option[value=terminate]')).toBeEnabled();
  await page.getByTestId('apply-recommended').click();
  await select.selectOption('terminate');
  await page.getByTestId('confirm-publish').click();
  await expect(page.getByRole('status')).toContainText('发布成功');
  await page.goto('/monitor?instance=INS-2026-0031');
  await expect(page.getByTestId('instance-detail')).toContainText('已终止');
 });
 test('撤回回到上一快照，后续改动须填原因再发布',async({page})=>{
  await page.goto('/workflows/wf-3/versions');
  await expect(page.getByTestId('publish-records')).toContainText('v3');
  await page.getByTestId('withdraw-button').click();
  await expect(page.getByRole('status')).toContainText('已撤回');
  await expect(page.getByTestId('publish-records')).toContainText('已撤回');
  await page.goto('/workflows/wf-3');
  await expect(page.locator('.draft-indicator')).toContainText('v2');
  await expect(page.locator('.draft-indicator')).toContainText('撤回后变更需填原因');
  await page.getByTestId('canvas-node-condition').click();
  await page.getByLabel('条件比较值').fill('8000');
  await page.getByTestId('save-node-config').click();
  await page.getByRole('button',{name:'保存草稿'}).click();
  await page.getByTestId('publish-button').click();
  await expect(page.getByTestId('reason-box')).toBeVisible();
  await page.getByTestId('apply-recommended').click();
  await expect(page.getByTestId('confirm-publish')).toBeDisabled();
  await page.getByTestId('draft-reason-input').fill('调整高额阈值至 8000');
  await page.getByTestId('confirm-publish').click();
  await expect(page.getByRole('status')).toContainText('发布成功');
  await page.goto('/workflows/wf-3/versions');
  const records=page.getByTestId('publish-records');
  await expect(records).toContainText('v4');
  await expect(records).toContainText('调整高额阈值至 8000');
  await expect(records).toContainText('已冻结');
 });
 test('刷新后发布记录与实例绑定一致',async({page})=>{
  await page.goto('/workflows/wf-2');
  await page.getByTestId('publish-button').click();
  await page.getByTestId('apply-recommended').click();
  await page.getByTestId('confirm-publish').click();
  await expect(page.getByRole('status')).toContainText('发布成功');
  await page.goto('/workflows/wf-2/versions');
  await expect(page.getByTestId('publish-records')).toContainText('v3');
  await expect(page.getByTestId('publish-records')).toContainText('3 切换新版本 · 2 保留旧快照 · 0 终止');
  await page.reload();
  await expect(page.getByTestId('publish-records')).toContainText('v3');
  await expect(page.getByTestId('publish-records')).toContainText('3 切换新版本 · 2 保留旧快照 · 0 终止');
  await page.goto('/monitor?instance=INS-2026-0026');
  await expect(page.getByTestId('instance-version')).toContainText('v3');
  await page.goto('/monitor?instance=INS-2026-0002');
  await expect(page.getByTestId('instance-version')).toContainText('v2');
 });
});

test('1440px 桌面视觉与控制台验证',async({page})=>{
 const errors:string[]=[]; page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 for(const path of ['/','/workflows/wf-1','/monitor']){await page.goto(path);await page.waitForTimeout(250);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);expect(overflow,`${path} 不应横向溢出`).toBeFalsy()}
 await page.goto('/'); await page.screenshot({path:'test-results/dashboard-1440.png',fullPage:true});
 expect(errors,'浏览器 console 不应出现 error').toEqual([]);
});
