import { launchBrowser } from '../../../scripts/browser.mjs';
import { mkdir } from 'node:fs/promises';
const browser = await launchBrowser({args:['--enable-webgl','--use-angle=metal']});
try {
  const page=await browser.newPage({viewport:{width:1200,height:760}});
  page.on('pageerror',e=>console.error(e));
  page.on('console',m=>{if(m.type()==='error') console.error(m.text())});
  await page.goto(process.argv[2]||'http://127.0.0.1:8387/');
  await page.waitForFunction(()=>window.threshold?.ready===true);
  await page.waitForTimeout(350);
  await mkdir('output',{recursive:true});
  await page.screenshot({path:'output/'+(process.argv[3]||'proof')+'.png'});
  console.log(await page.evaluate(()=>window.threshold.inspect()));
} finally { await browser.close(); }
