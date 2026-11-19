const {test} = require('node:test');
const assert = require('node:assert/strict');
const {simulate} = require('../src/history.js');
test('256 seeds preserve settlement, causation, chronology, and burial order', () => {
  const endings = new Set();
  for(let seed=0; seed<256; seed++){
    const site=simulate(seed), {events,buildings,deposits,finds}=site;
    assert.ok(events.length>=8,'centuries of occupation leave a ledger');
    assert.deepEqual(site,simulate(seed));
    assert.ok(events.at(-1).year-events[0].year>=200);
    events.forEach((e,i)=>{
      assert.equal(e.id,i);
      if(i) assert.ok(e.year>=events[i-1].year);
      e.causes.forEach(c=>assert.ok(c<i && events[c]));
    });
    for(const b of buildings) assert.equal(events[b.origin].construct,b.type);
    for(const f of finds){
      assert.equal(events[f.origin].object,f.kind);
      assert.equal(events[f.origin].zone,f.zone);
      const d=deposits[f.layer];
      assert.ok(d.start<=events[f.origin].year && events[f.origin].year<=d.end);
      assert.ok(d.top<=f.depth && f.depth<=d.bottom);
    }
    for(let i=1;i<deposits.length;i++){
      assert.equal(deposits[i].bottom,deposits[i-1].top);
      assert.ok(deposits[i].start>deposits[i-1].end);
    }
    assert.equal(events.at(-1).type,'abandon');
    assert.equal(events.at(-1).people,0);
    assert.equal(finds.length,events.filter(e=>e.object).length);
    endings.add(site.cause);
  }
  assert.equal(endings.size,2);
});
