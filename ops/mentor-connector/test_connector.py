"""No-network connector lifecycle fixtures; never imports Hermes or uses OAuth."""
import json
from pathlib import Path
import sys
import tempfile
import time
import unittest
import connector

class ConnectorTests(unittest.TestCase):
    def test_origin_boundary(self):
        for value in ['http://example.com', 'https://user:pass@example.com', 'https://example.com/path']:
            with self.assertRaises(ValueError):
                connector.Relay(value)
        connector.Relay('http://127.0.0.1:1234', allow_local=True)

    def test_cancel_or_disconnect_stops_worker_without_result(self):
        for mode in ['cancelled', 'disconnected']:
            calls=[]
            class Relay:
                def call(self, path, body):
                    calls.append(path)
                    if mode == 'disconnected':
                        raise ConnectionError('fixture')
                    return {'state':'cancelled'}
            job={'session_id':'fixture','lease':'fixture','deadline':time.time()*1000+10000,'context':{}}
            started=time.monotonic()
            connector.run_job(Relay(),job,[sys.executable,'-c','import time; time.sleep(30)'])
            self.assertLess(time.monotonic()-started,5)
            self.assertEqual(calls,['/connector/fixture/heartbeat'])

    def test_delivery_retry_does_not_rerun_model(self):
        with tempfile.TemporaryDirectory() as folder:
            counter=Path(folder)/'runs'
            script=Path(folder)/'runner.py'
            script.write_text("import pathlib,sys,json\np=pathlib.Path(sys.argv[1]);p.write_text(p.read_text()+'x' if p.exists() else 'x')\nprint(json.dumps({'text':'fixture'}))\n")
            results=[]
            class Relay:
                def call(self,path,body):
                    if path.endswith('/heartbeat'):
                        return {'state':'running'}
                    results.append(body)
                    if len(results)<2:
                        raise ConnectionError('fixture')
                    return {'accepted':True}
            job={'session_id':'fixture','lease':'fixture','deadline':time.time()*1000+10000,'context':{}}
            connector.run_job(Relay(),job,[sys.executable,str(script),str(counter)])
            self.assertEqual(counter.read_text(),'x')
            self.assertEqual(len(results),2)
            self.assertEqual(results[0],results[1])

if __name__=='__main__':
    unittest.main()
