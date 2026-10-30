const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),ts=require('typescript');
function load(file){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/modules/admin',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,experimentalDecorators:true}}).outputText,{exports,require});return exports;}
const {normalizeTeacherPositions:n}=load('teacher-positions.ts');
assert.equal(n(undefined,'supervisor_teacher').join(','),'supervisor,teacher');
assert.equal(n(['supervisor','teacher']).length,2);
assert.equal(n(['teacher','teacher']).length,1);
assert.equal(n([],'supervisor_teacher').length,0);
assert.equal(n(undefined,'supervisor').join(','),'supervisor');
const {validateSync}=require('class-validator');const {UpdateTeacherDto}=load('dto/update-teacher.dto.ts');
for(const positions of [['teacher'],['supervisor'],['supervisor','teacher'],[]])assert.equal(validateSync(Object.assign(new UpdateTeacherDto(),{teacherPositions:positions})).length,0);
for(const positions of [['supervisor_teacher'],['teacher','teacher'],'teacher'])assert.ok(validateSync(Object.assign(new UpdateTeacherDto(),{teacherPositions:positions})).length);
console.log('岗位多选检查通过：主管与教师可同时选择，旧复合值拆分，空数组清除，重复及非法岗位拒绝。');
