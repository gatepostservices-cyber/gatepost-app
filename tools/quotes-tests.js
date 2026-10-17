// Run: node tools/quotes-tests.js   (must print 19/19 PASS before any push)
var E=require('../quotes-engine.js');var T=[
["handyman",{items:{hrs:1},fuel:20,grt:"rrs"},"1hr->$75 min +20 fuel=95; tax 95*.074375=7.07; 102.07"],
["handyman",{items:{hrs:3,fauc:1},mat:100,cont:5,fuel:25,miles:10,grt:"abq"},"195+175=370; mat 132; cont 5% of 502=25.10; fuel 25; mi 7.60; sub 559.70; tax 7.625%=42.68; 602.38"],
["yard",{items:{lvl:{k:"light",p:200},mul:3,dirt:4},mat:150,fuel:20,dump:"sgt",tons:1,grt:"rrb"},"250(floor)+300+400=950; mat 198; fuel 20; dump 25; sub 1193; tax 7.875%=93.95; 1286.95"],
["yard",{items:{mo:{p:110,n:6},ph:4,xl:1},fuel:15,dump:"sgs",grt:"rrs"},"660+200+150=1010;+15+6=1031; tax 76.68; 1107.68"],
["junk",{items:{load:"h",uh:1},fuel:20,dump:"str",tons:0.8,grt:"rrs"},"225+34.95+20+28=307.95; tax 22.90; 330.85"],
["junk",{items:{load:"f",xl:1,uh:1},fuel:25,dump:"str",tons:1.2,dump2:"cc",tons2:1.3,grt:"abq"},"375+325+34.95+25+42+39=840.95; tax 64.12; 905.07"],
["tree",{items:{trim:{n:3,p:100},rem:{n:1,p:200}},fuel:20,dump:"sgt",tons:0.5,grt:"rrs"},"300+200+20+12.5=532.5; tax 39.60; 572.10"],
["tree",{items:{trim:{n:2,p:60},ph:2},cont:10,fuel:20,grt:"rrb"},"trim raised 2x75=150 +100=250; cont 25; +20=295; tax 23.23; 318.23"],
["pool",{items:{base:250},mat:80,fuel:20,grt:"rrs"},"300 floor; mat 105.60; +20=425.60; tax 31.65; 457.25"],
["pool",{items:{base:450,hrs:1},mat:120,cont:5,fuel:25,grt:"abq"},"450+65=515; mat 158.40; cont 33.67; +25=732.07; tax 55.82; 787.89"],
["garage",{items:{one:1},fuel:20,grt:"rrs"},"245; tax 18.22; 263.22"],
["garage",{items:{pair:1},fuel:20,miles:15,grt:"abq"},"350+20+11.40=381.40; tax 29.08; 410.48"],
["moving",{items:{hrs:3},fuel:20,grt:"rrs"},"320; tax 23.80; 343.80"],
["moving",{items:{hrs:4.5,uh:1},fuel:25,grt:"rrb"},"450+34.95+25=509.95; tax 40.16; 550.11"],
["gutters",{items:{g:{s:1,ft:220}},fuel:20,grt:"rrs"},"140+45*0.85=178.25+20=198.25; tax 14.74; 212.99"],
["gutters",{items:{g:{s:2,ft:220}},fuel:20,grt:"abq"},"250+45*1.4=313+20=333; tax 25.39; 358.39"],
["custom",{items:{c:[{d:"Fence repair",q:2,p:65},{d:"Haul",q:1,p:100}]},mat:50,fuel:20,grt:"rrs"},"230+66+20=316; tax 23.50; 339.50"],
["custom",{items:{c:[{d:"Paint",q:8,p:65}]},mat:200,cont:10,fuel:20,grt:"abq"},"520+264=784; cont 78.40; +20=882.40; tax 67.28; 949.68"]];
T.push(["junk",{items:{load:"q"},fuel:20,dump:"str",tons:0.3,grt:"rrs"},"190+20+10.5=220.5; tax 16.40; 236.90"]);

var p=0,fail=0;T.forEach(function(t,i){var r=E.calc(t[0],t[1]);var exp=parseFloat(t[2].match(/([\d.]+)\s*$/)[1]);var ok=Math.abs(r.total-exp)<0.005;ok?p++:fail++;
 console.log((ok?'PASS':'FAIL')+' #'+(i+1)+' '+t[0].padEnd(9)+' total '+r.total.toFixed(2)+' expected '+exp.toFixed(2)+(r.warn.length?'  warn: '+r.warn.join('; '):''));});
// Customer-facing output checks: no overhead note, no banned claims, only the business phone.
var bad=/licens|insured|bonded|certif|guarant|overhead|15%/i,lineFail=0;
T.forEach(function(t){E.calc(t[0],t[1]).lines.forEach(function(l){if(bad.test(l.l)){lineFail++;console.log('FAIL customer line: '+l.l);}});});
var fs=require('fs'),path=require('path'),root=path.join(__dirname,'..');
['quotes.js','quotes-engine.js'].forEach(function(f){var s=fs.readFileSync(path.join(root,f),'utf8');(s.match(/\(?\d{3}\)?[ .-]\d{3}-\d{4}/g)||[]).forEach(function(n){if(n.replace(/\D/g,'')!=='5057503019'){lineFail++;console.log('FAIL phone in '+f+': '+n);}});
 if(f==='quotes.js'&&/licensed|insured|bonded|certified|guaranteed/i.test(s.replace(/\/\/.*$/mg,''))){lineFail++;console.log('FAIL banned word in quotes.js');}});
console.log(p+'/'+T.length+' bid totals pass; customer-output checks '+(lineFail?'FAILED ('+lineFail+')':'pass'));
process.exit(fail||lineFail?1:0);
