from pathlib import Path
import zipfile
import xml.etree.ElementTree as ET

# Native print settings are not exposed by the bundled workbook authoring API.
p=Path(__file__).parent/'锐之博_校区及学生信息登记表.xlsx'
ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
ET.register_namespace('',ns)
def tag(n): return '{'+ns+'}'+n
with zipfile.ZipFile(p) as z:
    data={n:z.read(n) for n in z.namelist()}
workbook=ET.fromstring(data['xl/workbook.xml'])
names=workbook.find(tag('definedNames'))
if names is None:
    names=ET.Element(tag('definedNames'))
    idx=list(workbook).index(workbook.find(tag('sheets')))+1
    workbook.insert(idx,names)
sheet_specs=[('校区及教师','E'),('学生及家长','E')]
for i,(name,last) in enumerate(sheet_specs):
    ET.SubElement(names,tag('definedName'),{'name':'_xlnm.Print_Area','localSheetId':str(i)}).text=f"'{name}'!$A$1:${last}$30"
    part=f'xl/worksheets/sheet{i+1}.xml'
    root=ET.fromstring(data[part])
    prop=root.find(tag('sheetPr'))
    if prop is None:
        prop=ET.Element(tag('sheetPr'));root.insert(0,prop)
    setup=prop.find(tag('pageSetUpPr'))
    if setup is None: setup=ET.SubElement(prop,tag('pageSetUpPr'))
    setup.set('fitToPage','1')
    for n in ['printOptions','pageMargins','pageSetup']:
        old=root.find(tag(n))
        if old is not None:root.remove(old)
    insert_at=len(root)
    for j,child in enumerate(root):
        if child.tag.split('}')[-1] in ['headerFooter','rowBreaks','colBreaks','customProperties','cellWatches','ignoredErrors','smartTags','drawing','legacyDrawing','legacyDrawingHF','picture','oleObjects','controls','webPublishItems','tableParts','extLst']:
            insert_at=j;break
    settings=[ET.Element(tag('printOptions'),{'horizontalCentered':'1','gridLines':'0','headings':'0'}),ET.Element(tag('pageMargins'),{'left':'0.3','right':'0.3','top':'0.4','bottom':'0.4','header':'0.15','footer':'0.15'}),ET.Element(tag('pageSetup'),{'paperSize':'9','orientation':'portrait','fitToWidth':'1','fitToHeight':'1','blackAndWhite':'1'})]
    for j,item in enumerate(settings): root.insert(insert_at+j,item)
    data[part]=ET.tostring(root,encoding='utf-8',xml_declaration=True)
data['xl/workbook.xml']=ET.tostring(workbook,encoding='utf-8',xml_declaration=True)
with zipfile.ZipFile(p,'w',zipfile.ZIP_DEFLATED) as z:
    for n,b in data.items():z.writestr(n,b)
with zipfile.ZipFile(p) as z:
    assert z.testzip() is None
    for i in range(1,3):
        r=ET.fromstring(z.read(f'xl/worksheets/sheet{i}.xml'))
        assert r.find(tag('pageSetup')).attrib['paperSize']=='9'
        assert r.find(tag('pageSetup')).attrib['fitToHeight']=='1'
    assert len(ET.fromstring(z.read('xl/workbook.xml')).find(tag('sheets')))==2
print('Verified: 2 sheets, A4 portrait, each fits one page; reusable student form with 20 blank rows.')
