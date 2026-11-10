import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveSummary,filterRows } from '../src/features/admin/admin-model.js';

test('the Approved dashboard action opens accepted enrolments rather than confirmed follow-ups',async()=>{
  const [{createServer},React,{renderToStaticMarkup}]=await Promise.all([import('vite'),import('react'),import('react-dom/server')]);
  const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
  try{
    const {default:AdminOverview}=await vite.ssrLoadModule('/src/features/admin/AdminOverview.jsx');
    const rows=[
      {id:'pending',parentName:'Pending parent',formType:'enrol',status:'confirmed',reviewDecision:'pending',submittedAt:'2026-11-10T00:00:00Z'},
      {id:'approved',parentName:'Approved parent',formType:'enrol',status:'new',reviewDecision:'accepted',submittedAt:'2026-11-10T00:00:00Z'},
      {id:'trial',parentName:'Trial parent',formType:'trial',status:'confirmed',reviewDecision:'accepted',submittedAt:'2026-11-10T00:00:00Z'},
    ];
    let opened;
    const props={rows,summary:deriveSummary(rows),members:[],auth:{user:{email:'admin@example.test'}},onOpen:()=>{},onViewRegister:value=>{opened=value;},onTeam:()=>{},Icon:()=>null,Avatar:()=>null,StatusBadge:({status})=>status};
    const tree=AdminOverview(props),metrics=React.Children.toArray(tree.props.children)[0];
    const approved=React.Children.toArray(metrics.props.children).find(child=>child.props.label==='Approved');
    assert.ok(approved);assert.equal(approved.props.value,1);approved.props.onClick();
    assert.deepEqual(opened,{formType:'enrol',reviewDecision:'accepted'});
    assert.deepEqual(filterRows(rows,opened).map(row=>row.id),['approved']);
    const html=renderToStaticMarkup(React.createElement(AdminOverview,props));
    assert.match(html,/View approved enrolment requests/);assert.match(html,/Follow-up status/);
    assert.doesNotMatch(html,/View confirmed enrolment requests/);
  }finally{await vite.close();}
});
