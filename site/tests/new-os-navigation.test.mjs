import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const code=ts.transpileModule(readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
function descendants(node){if(!node||typeof node!=='object')return [];return [node,...[node.props?.children].flat(Infinity).flatMap(descendants)];}
for(const role of ['supervisor','eletrica','hidraulica','refrigeracao','civil']) test(`Nova OS opens its form for ${role}`,()=>{
  let view=role==='supervisor'?'assignments':'send',index=0;
  const exports={};
  const jsx=(type,props)=>({type,props});
  const react={useEffect(){},useMemo:fn=>fn(),useState:initial=>{const i=index++;return [i<4?[role,view,[],''][i]:(typeof initial==='function'?initial():initial),value=>{if(i===1)view=value;}];}};
  vm.runInNewContext(code,{exports,require:name=>name==='react'?react:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name==='./order-deadlines'?{saoPauloDate:()=> '2026-10-05'}:name==='lucide-react'?new Proxy({},{get:(_,key)=>String(key)}):{default:name},console});
  const render=()=>{index=0;return descendants(exports.default());};
  const button=render().find(n=>n.type==='button'&&[n.props.children].flat(Infinity).includes(' Nova OS'));
  assert.ok(button,'Nova OS button must be reachable');button.props.onClick();assert.equal(view,'new');
  const nodes=render();assert.ok(nodes.some(n=>n.type==='./NewLocalOrder'&&n.props.role===role),'new view must render NewLocalOrder');
  assert.ok(nodes.filter(n=>n.type==='button').every(n=>!String(n.props.className).includes('[object Object]')));
});
