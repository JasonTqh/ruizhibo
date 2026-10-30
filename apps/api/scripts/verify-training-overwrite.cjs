/* All fixtures and mutations run inside one database transaction that always rolls back. */
const assert=require('node:assert/strict');
const {PrismaClient}=require('@prisma/client');
const {TrainingCourseService}=require('../dist/modules/training/training-course.service');
const {TrainingOverwriteService}=require('../dist/modules/training/training-overwrite.service');
const {TrainingLifecycleService}=require('../dist/modules/training/training-lifecycle.service');
const {TrainingAccessService}=require('../dist/modules/training/training-access.service');
const {TrainingAuditService}=require('../dist/modules/training/training-audit.service');
const {TrainingTeacherService}=require('../dist/modules/training/training-teacher.service');
const {assertSnapshotVersion}=require('../dist/modules/training/training-version');
const prisma=new PrismaClient();const rollback=new Error('ROLLBACK_OVERWRITE_TEST');
const statusReject=(f,n)=>assert.rejects(f,e=>e.getStatus?.()===n);
const dto=()=>({reason:'验证课程更新',code:'VERIFY-OVERWRITE',name:'验证课程',category:'business',summary:'验证内容',expectedMinutes:15,minimumMinutes:15,sortOrder:1,isRequired:true,requiresPractical:true,isSafety:false,status:'enabled',chapters:[{title:'原章节',contentHtml:'<p>原内容</p>',sortOrder:1,isEnabled:true,media:[]}],quiz:{passScore:80,maxAttempts:3,questions:[{type:'single_choice',prompt:'原题目',options:[{id:'a',label:'正确'},{id:'b',label:'错误'}],correctAnswers:['a'],score:100,sortOrder:1}]},practicalItems:[{title:'原实操',instructions:'原要求',isRequired:true,sortOrder:1}]});
async function main(){
 assert.equal(process.env.VERIFY_TRAINING_OVERWRITE_ROLLBACK,'1');
 try{await prisma.$transaction(async tx=>{
  const db=new Proxy(tx,{get(t,k){return k==='$transaction'?(ops)=>typeof ops==='function'?ops(db):Promise.all(ops):t[k];}});
  const audit=new TrainingAuditService(db),access=new TrainingAccessService(db),lifecycle=new TrainingLifecycleService(db,audit),overwrite=new TrainingOverwriteService(db,audit,lifecycle),courses=new TrainingCourseService(db,access,audit,overwrite);
  const teacherService=new TrainingTeacherService(db,access,audit,lifecycle);
  const admin=await tx.user.create({data:{role:'admin',name:'verification-overwrite-admin'}});
  const denied=await tx.user.create({data:{role:'admin',name:'verification-no-global'}});
  await tx.trainingPermissionGrant.create({data:{userId:admin.id,permission:'training_manage',scopeKey:'GLOBAL'}});
  const campus=await tx.campus.create({data:{name:'verification-overwrite-campus'}});
  await tx.trainingFeatureFlag.create({data:{campusId:campus.id,enabled:true,reason:'事务回滚验证'}});
  const template=(await courses.create(admin.id,dto())).data;
  const fixture=async(label,assignmentStatus='in_progress',courseStatus='in_progress',seconds=90)=>{
   const teacher=await tx.user.create({data:{role:'teacher',name:'verification-'+label}});
   const assignment=await tx.trainingAssignment.create({data:{teacherId:teacher.id,campusId:campus.id,status:assignmentStatus,roundNumber:1,activeSlot:['completed','terminated'].includes(assignmentStatus)?null:teacher.id,dueAt:new Date(Date.now()+86400000),startedAt:new Date(),frozenAt:assignmentStatus==='frozen'?new Date():null}});
   const snapshot=await courses.createSnapshot(tx,template.id);const data=snapshot.payload;
   const course=await tx.trainingAssignmentCourse.create({data:{assignmentId:assignment.id,originalCourseId:template.id,snapshotId:snapshot.id,sortOrder:1,status:courseStatus,attempts:{create:{attemptNumber:1,snapshotId:snapshot.id,status:'in_progress',accumulatedSeconds:seconds,startedAt:new Date(),chapterProgress:{create:{chapterKey:data.chapters[0].key,completedAt:new Date()}},quizAttempts:{create:{attemptNumber:1,answers:[{questionId:data.quiz.questions[0].id,answerIds:['a']}],score:100,passed:true}},practicalChecks:{create:{reviewerId:admin.id,conclusion:'passed',checklistResults:[{itemId:data.practicalItems[0].id,passed:true}],comment:'已通过'}}}}},include:{attempts:true}});
   await tx.trainingStudySession.create({data:{clientSessionId:'verification-'+course.id,courseAttemptId:course.attempts[0].id,chapterKey:data.chapters[0].key,kind:'content'}});
   return {teacher,assignment,snapshot,course};
  };
  const active=await fixture('active');const locked=await fixture('locked','pending','locked',0);
  const exclusions=[await fixture('frozen','frozen'),await fixture('ended','completed','completed'),await fixture('terminated','terminated'),await fixture('done-course','in_progress','completed'),await fixture('exempt','in_progress','exempted')];
  await statusReject(()=>courses.previewUpdate(denied.id,template.id,dto()),403);
  await courses.update(admin.id,template.id,{...dto(),minimumMinutes:12});
  assert.equal((await tx.trainingAssignmentCourse.findUnique({where:{id:active.course.id},include:{snapshot:true}})).snapshot.minimumMinutes,15);
  let proposed={...dto(),minimumMinutes:3,overwriteExisting:true};
  const preview=(await courses.previewUpdate(admin.id,template.id,proposed)).data;
  assert.equal(preview.count,2);assert(preview.targets.every(t=>t.preservedChapters===1&&!t.retakeQuiz&&!t.recheckPractical));
  await statusReject(()=>courses.update(admin.id,template.id,proposed),409);
  await statusReject(()=>courses.update(admin.id,template.id,{...proposed,minimumMinutes:4,previewToken:preview.token}),409);
  const updated=(await courses.update(admin.id,template.id,{...proposed,previewToken:preview.token})).data;assert.equal(updated.overwrittenCount,2);
  let current=await tx.trainingAssignmentCourse.findUnique({where:{id:active.course.id},include:{snapshot:true,attempts:{orderBy:{attemptNumber:'desc'},include:{chapterProgress:true,quizAttempts:true,practicalChecks:true,snapshot:true}}}});
  assert.equal(current.snapshot.minimumMinutes,3);assert.equal(current.snapshot.payload.course.minimumMinutes,3);assert.equal(current.currentAttemptNumber,2);
  const next=current.attempts[0],old=current.attempts[1];assert.equal(next.accumulatedSeconds,90);assert.equal(old.status,'superseded');assert.equal(old.snapshot.minimumMinutes,15);assert.equal(next.chapterProgress.length,1);assert.equal(next.quizAttempts[0].score,100);assert.equal(next.quizAttempts[0].answers[0].questionId,current.snapshot.payload.quiz.questions[0].id);assert.equal(next.practicalChecks[0].checklistResults[0].itemId,current.snapshot.payload.practicalItems[0].id);
  assert.equal((await tx.trainingStudySession.findUnique({where:{clientSessionId:'verification-'+active.course.id}})).isActive,false);
  assert.equal((await teacherService.heartbeat(active.teacher.id,{clientSessionId:'verification-'+active.course.id,visible:true,active:true})).data.creditedSeconds,0);
  assert.throws(()=>assertSnapshotVersion(current.snapshot,active.snapshot.id),e=>e.getStatus()===409);
  assert.throws(()=>assertSnapshotVersion(current.snapshot),e=>e.getStatus()===409);
  assert.doesNotThrow(()=>assertSnapshotVersion(current.snapshot,current.snapshotId));
  assert.equal((await tx.trainingAssignmentCourse.findUnique({where:{id:locked.course.id}})).status,'locked');
  for(const skip of exclusions){const unchanged=await tx.trainingAssignmentCourse.findUnique({where:{id:skip.course.id}});assert.equal(unchanged.snapshotId,skip.snapshot.id);assert.equal(unchanged.currentAttemptNumber,1);}
  assert.equal((await tx.trainingAssignment.findUnique({where:{id:active.assignment.id}})).dueAt.getTime(),active.assignment.dueAt.getTime());
  proposed={...dto(),minimumMinutes:3,overwriteExisting:true,chapters:[{...dto().chapters[0],contentHtml:'<p>变化内容</p>'}],quiz:{...dto().quiz,passScore:90},practicalItems:[{...dto().practicalItems[0],instructions:'新要求'}]};
  const changed=(await courses.previewUpdate(admin.id,template.id,proposed)).data;
  assert(changed.targets.every(t=>t.relearnChapters.length===1&&t.retakeQuiz&&t.recheckPractical));
  await courses.update(admin.id,template.id,{...proposed,previewToken:changed.token});
  current=await tx.trainingAssignmentCourse.findUnique({where:{id:active.course.id},include:{attempts:{orderBy:{attemptNumber:'desc'},include:{chapterProgress:true,quizAttempts:true,practicalChecks:true}}}});
  assert.equal(current.attempts[0].accumulatedSeconds,90);assert.equal(current.attempts[0].chapterProgress.length,0);assert.equal(current.attempts[0].quizAttempts.length,0);assert.equal(current.attempts[0].practicalChecks.length,0);assert(current.attempts[1].quizAttempts.length);
  const stale=(await courses.previewUpdate(admin.id,template.id,proposed)).data;
  await tx.trainingAssignment.update({where:{id:active.assignment.id},data:{status:'frozen',frozenAt:new Date()}});
  await statusReject(()=>courses.update(admin.id,template.id,{...proposed,previewToken:stale.token}),409);
  assert.equal(await tx.trainingAuditRecord.count({where:{action:'course.overwrite'}}),4);
  const safetyDto={...dto(),code:'VERIFY-OVERWRITE-SAFETY',name:'验证安全课程',category:'safety',isSafety:true};
  const safetyTemplate=(await courses.create(admin.id,safetyDto)).data;
  const safetyTeacher=await tx.user.create({data:{role:'teacher',name:'verification-safety'}});
  const safetyAssignment=await tx.trainingAssignment.create({data:{teacherId:safetyTeacher.id,campusId:campus.id,status:'awaiting_safety',roundNumber:1,activeSlot:safetyTeacher.id,dueAt:new Date(Date.now()+86400000),startedAt:new Date()}});
  const safetySnapshot=await courses.createSnapshot(tx,safetyTemplate.id);
  const safePayload=safetySnapshot.payload;
  const safetyCourse=await tx.trainingAssignmentCourse.create({data:{assignmentId:safetyAssignment.id,originalCourseId:safetyTemplate.id,snapshotId:safetySnapshot.id,sortOrder:1,status:'awaiting_safety',attempts:{create:{attemptNumber:1,snapshotId:safetySnapshot.id,status:'awaiting_safety',accumulatedSeconds:900,chapterProgress:{create:{chapterKey:safePayload.chapters[0].key,completedAt:new Date()}},quizAttempts:{create:{attemptNumber:1,answers:[{questionId:safePayload.quiz.questions[0].id,answerIds:['a']}],score:100,passed:true}},practicalChecks:{create:{reviewerId:admin.id,conclusion:'passed',checklistResults:[{itemId:safePayload.practicalItems[0].id,passed:true}],comment:'已通过'}}}}}});
  await tx.trainingSafetyCredential.create({data:{teacherId:safetyTeacher.id,campusId:campus.id,status:'awaiting_confirmation'}});
  const safetyChanges={...safetyDto,overwriteExisting:true,chapters:[{...safetyDto.chapters[0],contentHtml:'<p>新安全要求</p>'}]};
  const safetyPreview=(await courses.previewUpdate(admin.id,safetyTemplate.id,safetyChanges)).data;
  await courses.update(admin.id,safetyTemplate.id,{...safetyChanges,previewToken:safetyPreview.token});
  assert.equal((await tx.trainingAssignmentCourse.findUnique({where:{id:safetyCourse.id}})).status,'in_progress');
  assert.equal((await tx.trainingAssignment.findUnique({where:{id:safetyAssignment.id}})).status,'in_progress');
  assert.equal((await tx.trainingSafetyCredential.findUnique({where:{teacherId:safetyTeacher.id}})).status,'retraining_required');
  assert.equal(await tx.trainingSafetyRecord.count({where:{teacherId:safetyTeacher.id,action:'invalidated'}}),1);

  throw rollback;
 },{timeout:120000});}catch(e){if(e!==rollback)throw e;}
 console.log('PASS: 可选不覆盖、预览令牌绑定、仅未冻结未完成未免修范围、进度/成绩映射、变化重学、旧版本历史、旧会话失效、截止日期保持、权限与状态竞争；全部测试数据已回滚。');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>prisma.$disconnect());
