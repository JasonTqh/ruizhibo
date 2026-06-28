import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "outputs", "new_store_model");
const outputPath = path.join(outputDir, "新店测算表_合肥分店.xlsx");

await fs.mkdir(outputDir, { recursive: true });

const wb = Workbook.create();

const colors = {
  navy: "#17324D",
  teal: "#0F766E",
  blue: "#DBEAFE",
  green: "#DCFCE7",
  yellow: "#FEF3C7",
  red: "#FEE2E2",
  white: "#FFFFFF",
  text: "#111827",
};

function setWidths(sheet, widths) {
  widths.forEach((width, index) => {
    sheet.getRangeByIndexes(0, index, 1, 1).format.columnWidthPx = width;
  });
}

function title(sheet, range, text) {
  const r = sheet.getRange(range);
  r.merge();
  r.values = [[text]];
  r.format = {
    fill: colors.navy,
    font: { bold: true, color: colors.white, size: 14 },
    horizontalAlignment: "center",
  };
  r.format.rowHeightPx = 36;
}

function header(sheet, range) {
  sheet.getRange(range).format = {
    fill: colors.teal,
    font: { bold: true, color: colors.white },
  };
}

function money(range) {
  range.format.numberFormat = "¥#,##0";
}

function pct(range) {
  range.format.numberFormat = "0.0%";
}

function days(range) {
  range.format.numberFormat = "0.0";
}

function prepare(sheet, widths, titleRange, titleText) {
  sheet.showGridLines = false;
  setWidths(sheet, widths);
  title(sheet, titleRange, titleText);
}

const guide = wb.worksheets.add("使用说明");
prepare(guide, [120, 520], "A1:B1", "新店测算表 - 使用说明");
guide.getRange("A3:B10").values = [
  ["步骤", "说明"],
  ["1", "先填写“一次性投入”和“月固定成本”中的蓝色单元格。"],
  ["2", "再到“产品毛利”填写主要产品的售价、成本和预计销售占比。"],
  ["3", "最后到“测算汇总”填写保守、正常、乐观三档日营业额。"],
  ["4", "表格会自动计算综合毛利率、保本日营业额、月利润和回本周期。"],
  ["判断标准", "回本周期 6-12 个月较健康，12-18 个月可考虑，18 个月以上需要谨慎。"],
  ["蓝色单元格", "需要手动填写或覆盖。"],
  ["绿色单元格", "公式自动计算，建议不要覆盖。"],
];
header(guide, "A3:B3");
guide.getRange("A3:B10").format.wrapText = true;

const investment = wb.worksheets.add("一次性投入");
prepare(investment, [210, 140, 360], "A1:C1", "一次性投入");
investment.getRange("A3:C14").values = [
  ["项目", "金额", "备注"],
  ["转让费", 30000, ""],
  ["押金", 20000, "通常 2-3 个月租金"],
  ["首月租金", 10000, ""],
  ["装修", 80000, ""],
  ["设备", 50000, ""],
  ["首批物料", 30000, ""],
  ["招牌/证照/杂费", 8000, ""],
  ["开业推广", 10000, ""],
  ["备用金", 45000, "建议至少覆盖 3 个月固定成本"],
  ["其他", 0, ""],
  ["合计投入", "", ""],
];
investment.getRange("B14").formulas = [["=SUM(B4:B13)"]];
header(investment, "A3:C3");
investment.getRange("B4:B13").format = { fill: colors.blue };
investment.getRange("A14:C14").format = { fill: colors.green, font: { bold: true } };
money(investment.getRange("B4:B14"));

const fixed = wb.worksheets.add("月固定成本");
prepare(fixed, [210, 140, 360], "A1:C1", "月固定成本");
fixed.getRange("A3:C13").values = [
  ["项目", "金额/月", "备注"],
  ["房租", 10000, ""],
  ["人工", 25000, "含店长、老师、兼职"],
  ["社保/补贴", 3000, ""],
  ["水电燃气", 4000, ""],
  ["物业/网络", 1500, ""],
  ["平台/系统费", 1000, ""],
  ["日常推广", 3000, ""],
  ["维修耗材", 1000, ""],
  ["其他", 500, ""],
  ["固定成本合计", "", ""],
];
fixed.getRange("B13").formulas = [["=SUM(B4:B12)"]];
header(fixed, "A3:C3");
fixed.getRange("B4:B12").format = { fill: colors.blue };
fixed.getRange("A13:C13").format = { fill: colors.green, font: { bold: true } };
money(fixed.getRange("B4:B13"));

const margin = wb.worksheets.add("产品毛利");
prepare(margin, [160, 110, 120, 120, 110, 120, 220], "A1:G1", "产品毛利");
margin.getRange("A3:G10").values = [
  ["产品", "售价", "单品成本", "单品毛利", "毛利率", "销售占比", "备注"],
  ["午托基础班", 1280, 460, "", "", 0.35, ""],
  ["晚辅作业班", 980, 320, "", "", 0.3, ""],
  ["全日托管", 2280, 880, "", "", 0.2, ""],
  ["特色成长课", 699, 210, "", "", 0.1, ""],
  ["临时托管", 80, 30, "", "", 0.05, ""],
  ["", "", "", "", "", "", ""],
  ["综合毛利率", "", "", "", "", "", ""],
];
margin.getRange("D4").formulas = [["=IF(OR(B4=\"\",C4=\"\"),\"\",B4-C4)"]];
margin.getRange("D4:D8").fillDown();
margin.getRange("E4").formulas = [["=IFERROR(D4/B4,\"\")"]];
margin.getRange("E4:E8").fillDown();
margin.getRange("E10").formulas = [["=IFERROR(SUMPRODUCT(E4:E8,F4:F8)/SUM(F4:F8),0)"]];
header(margin, "A3:G3");
margin.getRange("A4:C8").format = { fill: colors.blue };
margin.getRange("F4:G8").format = { fill: colors.blue };
margin.getRange("A10:G10").format = { fill: colors.green, font: { bold: true } };
money(margin.getRange("B4:D8"));
pct(margin.getRange("E4:E10"));
pct(margin.getRange("F4:F8"));

const summary = wb.worksheets.add("测算汇总");
prepare(summary, [180, 135, 135, 135, 135, 135, 150, 180], "A1:H1", "新店测算汇总");
summary.getRange("A3:B10").values = [
  ["关键指标", "结果"],
  ["一次性总投入", ""],
  ["每月固定成本", ""],
  ["综合毛利率", ""],
  ["月保本营业额", ""],
  ["日保本营业额", ""],
  ["建议备用金", ""],
  ["房租占营业额警戒线", 0.12],
];
summary.getRange("B4:B9").formulas = [
  ["='一次性投入'!B14"],
  ["='月固定成本'!B13"],
  ["='产品毛利'!E10"],
  ["=IFERROR(B5/B6,0)"],
  ["=B7/30"],
  ["=B5*3"],
];
summary.getRange("A12:H16").values = [
  ["情景", "日营业额", "月营业额", "月毛利", "固定成本", "月利润", "回本周期(月)", "判断"],
  ["保守", 2500, "", "", "", "", "", ""],
  ["正常", 4000, "", "", "", "", "", ""],
  ["乐观", 5500, "", "", "", "", "", ""],
  ["目标", "", "", "", "", "", "", ""],
];
summary.getRange("C13").formulas = [["=B13*30"]];
summary.getRange("C13:C16").fillDown();
summary.getRange("D13").formulas = [["=C13*$B$6"]];
summary.getRange("D13:D16").fillDown();
summary.getRange("E13").formulas = [["=$B$5"]];
summary.getRange("E13:E16").fillDown();
summary.getRange("F13").formulas = [["=D13-E13"]];
summary.getRange("F13:F16").fillDown();
summary.getRange("G13").formulas = [["=IFERROR($B$4/F13,\"\")"]];
summary.getRange("G13:G16").fillDown();
summary.getRange("H13").formulas = [[
  "=IF(F13<=0,\"亏损\",IF(G13<=12,\"健康\",IF(G13<=18,\"可考虑\",IF(G13<=24,\"谨慎\",\"风险高\"))))",
]];
summary.getRange("H13:H16").fillDown();
summary.getRange("B16").formulas = [["=$B$8"]];
header(summary, "A3:B3");
header(summary, "A12:H12");
summary.getRange("B13:B16").format = { fill: colors.blue };
summary.getRange("B4:B9").format = { fill: colors.green };
summary.getRange("B10").format = { fill: colors.yellow };
summary.getRange("A13:H13").format = { fill: colors.red };
summary.getRange("A14:H14").format = { fill: colors.green };
summary.getRange("A15:H15").format = { fill: colors.yellow };
money(summary.getRange("B4:B5"));
pct(summary.getRange("B6"));
money(summary.getRange("B7:B9"));
pct(summary.getRange("B10"));
money(summary.getRange("B13:F16"));
days(summary.getRange("G13:G16"));

const checks = wb.worksheets.add("检查清单");
prepare(checks, [300, 130, 420], "A1:C1", "开店前检查清单");
checks.getRange("A3:C12").values = [
  ["检查项", "状态", "备注"],
  ["候选点位已蹲点：工作日/周末/早中晚", "未完成", ""],
  ["周边小区、学校、竞品已统计", "未完成", ""],
  ["租金、转让费、免租期已谈清楚", "未完成", ""],
  ["消防、证照、门头限制已确认", "未完成", ""],
  ["保守情景亏损可承受 3-6 个月", "未完成", ""],
  ["核心产品、引流款、利润款已确定", "未完成", ""],
  ["开业推广计划和预算已准备", "未完成", ""],
  ["每日数据日报模板已准备", "未完成", ""],
  ["合同已由可靠人员复核", "未完成", ""],
];
header(checks, "A3:C3");
checks.getRange("B4:C12").format = { fill: colors.blue };
checks.getRange("B4:B12").dataValidation = {
  rule: { type: "list", values: ["未完成", "进行中", "已完成", "不适用"] },
};

for (const sheet of [guide, investment, fixed, margin, summary, checks]) {
  sheet.getUsedRange().format.wrapText = true;
}
for (const sheet of [investment, fixed, margin, summary, checks]) {
  sheet.freezePanes.freezeRows(3);
}

const errors = await wb.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "formula error scan",
});
console.log(errors.ndjson);

const xlsx = await SpreadsheetFile.exportXlsx(wb);
await xlsx.save(outputPath);
console.log(outputPath);
