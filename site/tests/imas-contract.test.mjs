import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function setup(role) {
  function load(path) {
    const exports = {};
    const require = name => name.endsWith('auth')
      ? { requireRole: async allowed => allowed.includes(role) ? role : null }
      : load(name.endsWith('imas-contract') ? 'app/imas-contract.ts' : 'app/photo-policy.ts');
    const output = ts.transpileModule(readFileSync(new URL('../' + path, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(output, { exports, require, Response });
    return exports;
  }
  return load('app/api/imas/contract/route.ts');
}

test('contrato bloqueia sessão ausente e todos os papéis além do Supervisor', async () => {
  for (const role of [null, 'engenheiro', 'eletrica', 'hidraulica', 'refrigeracao', 'civil']) {
    const response = await setup(role).GET();
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.equal((await response.json()).schemaVersion, undefined);
  }
});

test('Supervisor recebe exatamente o contrato documentado e o limite efetivo de fotos', async () => {
  const response = await setup('supervisor').GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  const contract = await response.json();
  const docs = readFileSync(new URL('../CONTRATO.md', import.meta.url), 'utf8');
  const documented = JSON.parse(docs.match(/```json\n([\s\S]*?)\n```/)[1]);
  assert.deepEqual(contract, documented);
  assert.equal(contract.schemaVersion, 1);
  assert.equal(contract.minExtensionVersion, '2.3.0');
  assert.equal(contract.config.maxFotosSemRevisao, 5);
  assert.equal(contract.config.osTestesAnteriores.length, 13);
});
