import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';
const out=fileURLToPath(new URL('.',import.meta.url));
const wb=Workbook.create();
function base(name,last,widths,title){const s=wb.worksheets.add(name);s.showGridLines=false;s.getRange(`A1:${last}31`).format={font:{name:'Microsoft YaHei',size:11,color:'#000000'},rowHeight:25,verticalAlignment:'center',fill:'#FFFFFF'};widths.forEach((w,i)=>s.getRange(`${String.fromCharCode(65+i)}1:${String.fromCharCode(65+i)}31`).format.columnWidth=w);s.mergeCells(`A1:${last}1`);s.getRange('A1').values=[[title]];s.getRange(`A1:${last}1`).format={font:{size:16,bold:true},horizontalAlignment:'center',rowHeight:38};return s;}
function text(s,r,t){s.getRange(r).values=[[t]];}
function merged(s,r,t){s.mergeCells(r);text(s,r.split(':')[0],t);}
function grid(s,last,start,end,headers){s.getRange(`A${start}:${last}${start}`).values=[headers];s.getRange(`A${start}:${last}${end}`).format.borders={preset:'all',style:'thin',color:'#000000'};s.getRange(`A${start}:${last}${end}`).format.rowHeight=31;s.getRange(`A${start}:${last}${start}`).format={font:{bold:true},horizontalAlignment:'center',rowHeight:30};s.getRange(`A${start+1}:${last}${end}`).setNumberFormat('@');s.freezePanes.freezeRows(start);}
const t=base('校区及教师','E',[16,22,16,24,18],'校区及教师信息表');
text(t,'A3','校区名称：');merged(t,'B3:E3','');t.getRange('B3:E3').format.borders={bottom:{style:'thin',color:'#000000'}};
text(t,'A4','主管姓名：');text(t,'C4','联系电话：');t.getRange('B4').format.borders={bottom:{style:'thin',color:'#000000'}};merged(t,'D4:E4','');t.getRange('D4:E4').format.borders={bottom:{style:'thin',color:'#000000'}};
merged(t,'A6:E6','填写方法：每人一行，主管也填写；岗位填教师、主管或主管兼教师。');
merged(t,'A7:E7','负责多个班级时用顿号隔开；不带班可留空。手机号填写完整。');t.getRange('A6:E7').format.font={size:10};
grid(t,'E',8,28,['姓名','手机号','岗位','负责班级','备注']);
merged(t,'A30:B30','填表人：________________');merged(t,'D30:E30','日期：______年____月____日');
const studentSheets=[];
for(let i=1;i<=1;i++){
 const s=base('学生及家长','E',[18,18,18,25,19],'学生及家长信息表');
 text(s,'A3','校区名称：');merged(s,'B3:C3','');s.getRange('B3:C3').format.borders={bottom:{style:'thin',color:'#000000'}};
 text(s,'D3','班级名称：');s.getRange('E3').format.borders={bottom:{style:'thin',color:'#000000'}};
 merged(s,'A4:C4','本班第 ______ 页');merged(s,'D4:E4','本表可按需重复打印');s.getRange('A4:E4').format.font={size:10};
 merged(s,'A5:E5','填写方法：每行填写一个学生和一位家长；有多位家长时另起一行，重复填写学生姓名。');
 merged(s,'A6:E6','与学生关系填写父亲、母亲等，手机号填写完整。每页填写一个班级，填满后另用一张。');s.getRange('A5:E6').format.font={size:10};
 grid(s,'E',7,27,['学生姓名','家长姓名','与学生关系','家长手机号','备注']);
 merged(s,'A30:B30','填表人：________________');merged(s,'D30:E30','日期：______年____月____日');
 studentSheets.push(s);
}
wb.recalculate();
console.log((await wb.inspect({kind:'table',range:'学生及家长!A7:E9',tableMaxRows:3,tableMaxCols:5})).ndjson);
await (await SpreadsheetFile.exportXlsx(wb)).save(`${out}/锐之博_校区及学生信息登记表.xlsx`);
for(const sheet of [t,...studentSheets]){const im=await wb.render({sheetName:sheet.name,range:'A1:E30',scale:1,format:'png'});await fs.writeFile(`${out}/分页_${sheet.name}.png`,new Uint8Array(await im.arrayBuffer()));}
