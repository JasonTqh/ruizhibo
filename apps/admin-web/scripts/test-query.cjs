const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const ts=require('typescript');
const React=require('react');
function load(file, deps) {
 const exports={};
 vm.runInNewContext(ts.transpileModule(readFileSync(join(__dirname,'../src/components',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:p=>deps[p]||require(p)});
 return exports;
}
const {matchesQuery}=load('QueryTable.tsx',{});
const fields=[{key:'name',label:'姓名',value:r=>r.name},{key:'class',label:'班级',value:r=>r.class?.name},{key:'status',label:'状态',value:r=>r.status},{key:'parent',label:'家长',value:r=>r.parents?.join(' ')}];
const row={name:'学生甲',class:{name:'一班'},status:'在读',parents:['家长乙']};
assert.equal(matchesQuery(row,fields,{name:'  学生 ',class:'一班',parent:'乙'}),true);
assert.equal(matchesQuery(row,fields,{name:'学生',class:'二班'}),false);
assert.equal(matchesQuery(row,fields,{}),true);
assert.equal(matchesQuery({},fields,{parent:'乙'}),false);
assert.equal(matchesQuery({name:'Alice'},fields,{name:' ALI '}),true);
let expanded=false;let resets=0;
const Form={Item:()=>null,useFormInstance:()=>({resetFields(){resets++;}}),useWatch:()=>({extra:'value'})};
const QueryFields=load('QueryFields.tsx',{'react':{...React,useState:()=>[expanded,v=>{expanded=v;}]},antd:{Form,Button:'button'}}).default;
const children=['first','second','third','extra','last'].map(name=>React.createElement(Form.Item,{name,key:name}));
function tree(){return QueryFields({children:[React.createElement(React.Fragment,{key:'group'},children),React.createElement(Form.Item,{key:'submit'},'查询')],primary:['first','second','third'],onReset(){}});}
function flatten(node){return React.isValidElement(node)?[node,...React.Children.toArray(node.props.children).flatMap(flatten)]:[];}
let nodes=flatten(tree());let inputs=nodes.filter(n=>n.props.name);
assert.equal(inputs.filter(n=>!n.props.hidden).length,3);
assert.equal(inputs.length,5); // Folding must preserve both advanced fields.
assert.equal(inputs.find(n=>n.props.name==='extra').props.hidden,true);
nodes.find(n=>n.type==='button'&&n.props.type==='link').props.onClick();
inputs=flatten(tree()).filter(n=>n.props.name);assert.equal(inputs.filter(n=>!n.props.hidden).length,5);
flatten(tree()).find(n=>n.type==='button'&&!n.props.type).props.onClick();assert.equal(resets,1);
console.log('查询检查通过：多属性组合、空条件、模糊匹配、嵌套属性、缺失值、默认三个属性、展开全部、折叠保留字段、重置。');

async function testCreateEntry() {
  const slots=[]; let cursor=0; let errors=0; let result=false; let reject=false; let submits=0;
  const react={...React,useEffect(){},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],v=>{slots[i]=v;}];}};
  const Modal=Object.assign(()=>null,{error(){errors++;}});
  const Entry=load('CreateEntry.tsx',{react, 'react':react,antd:{Button:'button',Modal}}).default;
  const child=React.createElement('form',{onFinish:async()=>{submits++;if(reject)throw Error('失败');return result;}});
  const render=()=>{cursor=0;return flatten(Entry({title:'新增学生',children:child}));};
  let tree=render();assert.equal(tree.find(n=>n.type===Modal).props.open,false);
  tree.find(n=>n.type==='button').props.onClick();tree=render();assert.equal(tree.find(n=>n.type===Modal).props.open,true);
  await tree.find(n=>n.type==='form').props.onFinish({name:'学生'});assert.equal(render().find(n=>n.type===Modal).props.open,true);
  reject=true;await render().find(n=>n.type==='form').props.onFinish({});assert.equal(errors,1);assert.equal(render().find(n=>n.type===Modal).props.open,true);
  reject=false;result=true;const submit=render().find(n=>n.type==='form').props.onFinish;await Promise.all([submit({}),submit({})]);assert.equal(submits,3);assert.equal(render().find(n=>n.type===Modal).props.open,false);
  console.log('新增弹窗检查通过：默认折叠、点击打开、失败保留、异常提示、成功关闭及防重复提交。');
}
testCreateEntry().catch(error=>{console.error(error);process.exitCode=1;});

const academyExports={};
vm.runInNewContext(ts.transpileModule(readFileSync(join(__dirname,'../src/pages/academy-sections.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:academyExports});
const {academySections,canAccessAcademySection}=academyExports;
assert.equal(new Set(academySections.map(s=>s.key)).size,10);
const none={trainingManage:false,practicalConfirm:false,safetyConfirm:false,permissionManage:false};
assert.equal(academySections.some(s=>canAccessAcademySection(s.key,none)),false);
const practicalRole={...none,practicalConfirm:true};
assert.equal(canAccessAcademySection('practical',practicalRole),true);
assert.equal(canAccessAcademySection('safety',practicalRole),false);
assert.equal(canAccessAcademySection('assignments',practicalRole),false);
const manager={...none,trainingManage:true};
assert.equal(canAccessAcademySection('records',manager),true);
assert.equal(canAccessAcademySection('permissions',manager),false);
assert.equal(canAccessAcademySection('permissions',{...manager,permissionManage:true}),true);
assert.equal(canAccessAcademySection('unknown',manager),false);
console.log('教师学院检查通过：十个独立模块、实操/安全权限隔离、学习档案访问及权限管理授权条件。');
