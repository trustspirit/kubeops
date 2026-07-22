import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('reviewed destructive settings actions require confirmation', () => {
  const kubeconfig = read('components/settings/kubeconfig-tab.tsx');
  const templates = read('components/settings/templates-tab.tsx');
  assert.match(kubeconfig, /<ConfirmDialog/);
  assert.match(kubeconfig, /Delete context \$\{deleteContextName\}/);
  assert.match(templates, /<ConfirmDialog/);
  assert.match(templates, /Delete template \$\{deleteTemplateTarget\?\.name\}/);
});

test('reviewed icon controls expose names and RBAC expansion state', () => {
  assert.match(read('components/resources/resource-detail-page.tsx'), /aria-label="Go back"/);
  assert.match(read('components/shared/kubectl-command-view.tsx'), /aria-label="Copy kubectl command"/);
  const rbac = read('components/rbac/rbac-summary.tsx');
  assert.match(rbac, /aria-expanded=\{isExpanded\}/);
  assert.match(rbac, /aria-controls=/);
  assert.match(read('app/clusters/[clusterId]/namespaces/[namespace]/pods/[podName]/logs/page.tsx'), /aria-label="Go back from pod logs"/);
  assert.match(read('app/clusters/[clusterId]/namespaces/[namespace]/pods/[podName]/exec/page.tsx'), /aria-label="Go back from pod terminal"/);
  assert.match(read('components/shared/port-forward-btn.tsx'), /aria-label=\{`Stop port forward for \$\{resourceName\} on local port \$\{active\.localPort\}`\}/);
});

test('port-forward controls use structured target matching and the assigned local port', () => {
  for (const path of ['components/shared/port-forward-btn.tsx', 'components/shared/yaml-editor.tsx']) {
    const source = read(path);
    assert.doesNotMatch(source, /id\.includes/);
    assert.match(source, /findMatchingPortForward/);
    assert.match(source, /response\.forward\.localPort/);
  }
});

test('port-forward stop failures remain visible without refreshing cached state', () => {
  const source = read('components/shared/port-forward-btn.tsx');
  const stopStart = source.indexOf('const stop = async () =>');
  const stopEnd = source.indexOf('\n\n  if (active)', stopStart);
  const stopSource = source.slice(stopStart, stopEnd);

  assert.ok(stopStart >= 0 && stopEnd > stopStart);
  assert.match(stopSource, /catch \(err: unknown\)/);
  assert.match(stopSource, /toast\.error\(`Failed to stop port forward:/);
  assert.equal((stopSource.match(/globalMutate\('\/api\/port-forward'\)/g) ?? []).length, 1);
  assert.ok(stopSource.indexOf("globalMutate('/api/port-forward')") < stopSource.indexOf('catch (err: unknown)'));
});
