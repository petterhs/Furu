import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionSegmentsForRange } from '../src/lib/connectionTimeline.ts';
const at = n => new Date(n * 1000).toISOString();
const event = (n, connected, until) => ({at:at(n),connected,...until === undefined ? {} : {observedUntil:at(until)}});
test('old connected events cannot paint an unobserved two-day interval green', () => {
 const events=[event(0,true),event(172800,true,172860)];
 assert.deepEqual(connectionSegmentsForRange(events,0,172860000),[
  {startMs:0,endMs:172800000,connected:null},
  {startMs:172800000,endMs:172860000,connected:true},
 ]);
});
test('a confirmed interval ends at its last observation, not the next reconnect',()=>{
 assert.deepEqual(connectionSegmentsForRange([event(0,true,60),event(180,true,240)],0,300000),[
  {startMs:0,endMs:60000,connected:true},
  {startMs:60000,endMs:180000,connected:null},
  {startMs:180000,endMs:240000,connected:true},
  {startMs:240000,endMs:300000,connected:null},
 ]);
});
test('known disconnections, range clipping and unknown prefixes remain distinct',()=>{
 assert.deepEqual(connectionSegmentsForRange([event(20,false),event(40,true,70),event(80,false)],10000,90000),[
  {startMs:10000,endMs:20000,connected:null},
  {startMs:20000,endMs:40000,connected:false},
  {startMs:40000,endMs:70000,connected:true},
  {startMs:70000,endMs:80000,connected:null},
  {startMs:80000,endMs:90000,connected:false},
 ]);
 assert.deepEqual(connectionSegmentsForRange([],0,100),[{startMs:0,endMs:100,connected:null}]);
 assert.deepEqual(connectionSegmentsForRange([],100,0),[]);
});
test('invalid and regressed observation timestamps never create green spans',()=>{
 assert.deepEqual(connectionSegmentsForRange([{at:at(10),connected:true,observedUntil:'invalid'},event(20,true,19)],0,30000),[{startMs:0,endMs:30000,connected:null}]);
});
