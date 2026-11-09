'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const dir=__dirname;
const files=fs.readdirSync(dir).filter(name=>/^test-.*\.js$/.test(name)).sort();
let failed=0;
for(const file of files){
  const result=spawnSync(process.execPath,[path.join(dir,file)],{stdio:'inherit'});
  if(result.status!==0){failed++;process.stderr.write(`\nFALHOU: ${file}\n`);}
}
process.stdout.write(`\nResultado: ${files.length-failed}/${files.length} testes aprovados.\n`);
process.exitCode=failed?1:0;
