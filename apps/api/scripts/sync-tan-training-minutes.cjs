/* One-time, explicitly authorized duration sync. Never resets study/quiz/practical history. */
const assert=require('node:assert/strict');
const {createHash,randomUUID}=require('node:crypto');
const {PrismaClient}=require('@prisma/client');
const {TrainingAuditService}=require('../dist/modules/training/training-audit.service');
const {TrainingLifecycleService}=require('../dist/modules/training/training-lifecycle.service');
const prisma=new PrismaClient();
const teacherId='cmv7q7ag9000wka01uxu1vsm8';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function main(){
 assert.equal(process.env.CONFIRM_TAN_TRAINING_MINUTES,teacherId,'Explicit teacher confirmation is required');
 const result=await prisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`training:${teacherId}`}))`;
  const teacher=await tx.user.findUniqueOrThrow({where:{id:teacherId},select:{id:true,name:true,role:true}});
  assert.equal(teacher.name,'谭庆华');assert.equal(teacher.role,'teacher');
  const actor=await tx.user.findFirst({where:{role:'admin',status:'active',trainingGrants:{some:{permission:'training_manage',scopeKey:'GLOBAL',isActive:true}}},select:{id:true}});
  assert(actor,'No active globally authorized training administrator');
  const assignment=await tx.trainingAssignment.findFirst({where:{teacherId,activeSlot:teacherId,status:{in:['pending','in_progress','awaiting_safety']},frozenAt:null},include:{courses:{orderBy:{sortOrder:'asc'},include:{snapshot:true,originalCourse:true,attempts:{orderBy:{attemptNumber:'desc'},take:1}}}}});
  assert(assignment,'No active unfrozen training assignment');
  const audit=new TrainingAuditService(tx),lifecycle=new TrainingLifecycleService(tx,audit);
  const rows=[];
  for(const course of assignment.courses){
   assert(course.originalCourse,'Missing current course template');
   const minutes=course.originalCourse.minimumMinutes;
   const before=course.snapshot.payload;
   if(course.snapshot.minimumMinutes===minutes && before.course.minimumMinutes===minutes){rows.push({course:course.snapshot.courseName,minutes,changed:false});continue;}
   assert(!['completed','exempted'].includes(course.status),'A differing course has since completed or been exempted; inspect before changing history');
   const attempt=course.attempts[0];assert(attempt);
   const history=async()=>({chapters:await tx.trainingChapterProgress.findMany({where:{courseAttemptId:attempt.id},orderBy:{id:'asc'}}),quiz:await tx.trainingQuizAttempt.findMany({where:{courseAttemptId:attempt.id},orderBy:{id:'asc'}}),practical:await tx.trainingPracticalCheck.findMany({where:{courseAttemptId:attempt.id},orderBy:{id:'asc'}})});
   const beforeHistory=digest(await history());
   const payload={...before,revision:randomUUID(),course:{...before.course,minimumMinutes:minutes}};
   const snapshot=await tx.trainingCourseSnapshot.create({data:{originalCourseId:course.originalCourseId,courseCode:course.snapshot.courseCode,courseName:course.snapshot.courseName,category:course.snapshot.category,minimumMinutes:minutes,requiresPractical:course.snapshot.requiresPractical,isSafety:course.snapshot.isSafety,payload,checksum:digest(payload)}});
   await tx.trainingAssignmentCourse.update({where:{id:course.id},data:{snapshotId:snapshot.id}});
   await tx.trainingCourseAttempt.update({where:{id:attempt.id},data:{snapshotId:snapshot.id}});
   await tx.trainingStudySession.updateMany({where:{courseAttemptId:attempt.id,isActive:true},data:{isActive:false,endedAt:new Date()}});
   const status=course.status==='locked'?null:await lifecycle.recomputeAttemptInTransaction(tx,attempt.id);
   await tx.trainingAssignmentCourse.update({where:{id:course.id},data:{lastLearningAt:course.lastLearningAt}});
   assert.equal(digest(await history()),beforeHistory,'Study/quiz/practical history changed unexpectedly');
   const afterAttempt=await tx.trainingCourseAttempt.findUniqueOrThrow({where:{id:attempt.id}});
   assert.equal(afterAttempt.accumulatedSeconds,attempt.accumulatedSeconds);
   await audit.log({actorId:actor.id,campusId:assignment.campusId,assignmentId:assignment.id,action:'course.minimum_minutes.sync',targetType:'TrainingAssignmentCourse',targetId:course.id,before:{snapshotId:course.snapshotId,minimumMinutes:course.snapshot.minimumMinutes,accumulatedSeconds:attempt.accumulatedSeconds},after:{snapshotId:snapshot.id,minimumMinutes:minutes,accumulatedSeconds:afterAttempt.accumulatedSeconds,historyPreserved:true},reason:'按用户确认，仅将谭庆华的必学时长同步至最新课程安排，保留已有学习及考核记录'},tx);
   rows.push({course:course.snapshot.courseName,beforeMinutes:course.snapshot.minimumMinutes,minutes,accumulatedSeconds:afterAttempt.accumulatedSeconds,remainingSeconds:Math.max(0,minutes*60-afterAttempt.accumulatedSeconds),changed:true,historyPreserved:true,status:status?.courseStatus??course.status});
  }
  return {teacher:teacher.name,assignmentId:assignment.id,courses:rows};
 },{timeout:60000});
 console.log(JSON.stringify(result,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>prisma.$disconnect());
