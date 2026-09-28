import gzip, json, os, pathlib, subprocess, tempfile, unittest
ROOT = pathlib.Path(__file__).resolve().parent.parent
TAG = 'a' * 40 + '-1-1'
BASE = '''NEXT_PUBLIC_APP_URL="https://ohpin.newdawn.co.kr"
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test
NEXT_PUBLIC_DATA_MODE=supabase
'''
MOCK = r'''#!/usr/bin/env python3
import json, os, pathlib, sys
p=pathlib.Path(os.environ['MOCK_STATE']); s=json.loads(p.read_text()); args=sys.argv[1:]; failure=os.environ.get('FAILURE','')
s['calls'].append(args)
def done(code=0, output=''):
 p.write_text(json.dumps(s)); print(output); sys.exit(code)
if args[0]=='info': done()
if args[:2]==['container','inspect']: done(0 if args[2] in s['containers'] else 1)
if args[:2]==['image','inspect']: done()
if args[0]=='load':
 sys.stdin.buffer.read(); done(1 if failure=='load' else 0)
if args[0]=='rm':
 s['containers'].pop(args[-1],None); done()
if args[0]=='run':
 name=args[args.index('--name')+1]
 s['containers'][name]={'image':args[-1],'running':True,'port':args[args.index('-p')+1], 'env':'new'}
 done(1 if failure=='run' and name=='ohpin-fe' else 0)
if args[0]=='inspect':
 name=args[-1]
 if name not in s['containers']: done(1)
 state='unhealthy' if (failure=='candidate' and name.endswith('candidate')) or (failure=='health' and name=='ohpin-fe') else 'healthy'
 done(output='running/'+state)
if args[0]=='rename':
 if failure=='rename' and args[1]=='ohpin-fe': done(1)
 s['containers'][args[2]]=s['containers'].pop(args[1]); done()
if args[0] in ['stop','start']:
 s['containers'][args[-1]]['running']=args[0]=='start'; done()
done(2)
'''
class Deployment(unittest.TestCase):
 def execute(self, failure='', old=True):
  with tempfile.TemporaryDirectory() as td:
   p=pathlib.Path(td); release=p/'releases'/TAG; release.mkdir(parents=True)
   (release/'runtime.env').write_text(BASE)
   (release/'image.tar.gz').write_bytes(gzip.compress(b'image'))
   bindir=p/'bin'; bindir.mkdir()
   commands={'docker':MOCK, 'flock':'#!/bin/sh\nexit 0\n', 'sleep':'#!/bin/sh\nexit 0\n', 'curl':'#!/bin/sh\nif [ "$FAILURE" = curl ]; then echo 500; else echo 200; fi\n'}
   for name, content in commands.items():
    f=bindir/name; f.write_text(content); f.chmod(0o755)
   containers={'unrelated':{'image':'backend','running':True}}
   prior={'image':'ohpin-fe:old','env':'original-secret','running':True,'port':'127.0.0.1:3002:3000'}
   if old: containers['ohpin-fe']=prior.copy()
   state=p/'state.json'; state.write_text(json.dumps({'containers':containers,'calls':[]}))
   env={**os.environ,'PATH':str(bindir)+':'+os.environ['PATH'],'MOCK_STATE':str(state),'FAILURE':failure}
   result=subprocess.run(['bash',str(ROOT/'scripts/deploy-ec2.sh'),str(release),TAG],env=env,capture_output=True,text=True)
   actual=json.loads(state.read_text())
   self.assertEqual(actual['containers']['unrelated'],containers['unrelated'])
   self.assertNotIn('ohpin-fe-candidate',actual['containers'])
   self.assertFalse((release/'runtime.env').exists())
   self.assertFalse((release/'image.tar.gz').exists())
   if failure:
    self.assertNotEqual(result.returncode,0,result.stdout+result.stderr)
    if old: self.assertEqual(actual['containers']['ohpin-fe'],prior)
    else: self.assertNotIn('ohpin-fe',actual['containers'])
   else:
    self.assertEqual(result.returncode,0,result.stdout+result.stderr)
    self.assertEqual(actual['containers']['ohpin-fe']['port'],'127.0.0.1:3002:3000')
    self.assertEqual(actual['containers']['ohpin-fe']['image'],'ohpin-fe:'+TAG)
    if old:
     self.assertEqual(actual['containers']['ohpin-fe-previous'],{**prior,'running':False})
 def test_first_install(self): self.execute(old=False)
 def test_upgrade(self): self.execute()
 def test_load_failure_preserves_service(self): self.execute('load')
 def test_candidate_failure_preserves_service(self): self.execute('candidate')
 def test_rename_failure_preserves_service(self): self.execute('rename')
 def test_run_failure_rolls_back(self): self.execute('run')
 def test_unhealthy_rolls_back(self): self.execute('health')
 def test_host_http_failure_rolls_back(self): self.execute('curl')
 def test_failed_first_install_cleans_up(self): self.execute('run',old=False)
class Environment(unittest.TestCase):
 def prepare(self, value):
  temp=tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup)
  p=pathlib.Path(temp.name)
  r=subprocess.run(['node',str(ROOT/'scripts/prepare-ec2-env.mjs'),str(p)],env={**os.environ,'ENV_FILE':value},capture_output=True,text=True)
  return r,p
 def test_quotes_crlf_and_private_separation(self):
  r,p=self.prepare(BASE.replace('\n','\r\n')+'RUNTIME_TOKEN="literal $VALUE # value"\n')
  self.assertEqual(r.returncode,0,r.stderr)
  self.assertIn('RUNTIME_TOKEN=literal $VALUE # value\n',(p/'runtime.env').read_text())
  self.assertNotIn('RUNTIME_TOKEN',(p/'public.env').read_text())
  self.assertEqual((p/'runtime.env').stat().st_mode & 0o777,0o600)
 def test_command_is_literal(self):
  r,p=self.prepare(BASE+'RUNTIME_TOKEN=$(touch /should-never-be-created)\n')
  self.assertEqual(r.returncode,0,r.stderr)
  self.assertIn('$(touch ',(p/'runtime.env').read_text())
 def test_bad_values_rejected(self):
  for value in ['',BASE.replace('DATA_MODE=supabase','DATA_MODE=demo'),BASE.replace('sb_publishable_test','sb_secret_nope'),BASE+'PORT=3001',BASE+'RENDER_WORKERS=0',BASE+'TOKEN="line1\nline2"',BASE+'NEXT_PUBLIC_UNKNOWN=x']:
   with self.subTest(value=value):
    r,p=self.prepare(value); self.assertNotEqual(r.returncode,0)
    self.assertFalse((p/'runtime.env').exists())
if __name__=='__main__': unittest.main(verbosity=2)
