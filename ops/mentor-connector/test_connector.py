"""No-network connector lifecycle fixtures; never imports Hermes or uses OAuth."""
import json
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
import connector

class ConnectorTests(unittest.TestCase):
    def test_browser_pairing_requires_matching_nonce_and_keeps_token_private(self):
        for matches in [True, False]:
            with tempfile.TemporaryDirectory() as folder:
                credentials, status = Path(folder)/'connection.json', Path(folder)/'status.json'
                class Relay:
                    origin='https://fixture.invalid'
                    def call(self, path, body):
                        if path.endswith('/enroll'):
                            self.nonce=body['client_nonce']
                            return {'user_code':'a'*18,'device_code':'device-secret','expires_at':time.time()*1000+10000}
                        return {'client_nonce':self.nonce if matches else 'wrong','token':'token-secret'}
                with patch.object(connector.time,'sleep'):
                    if matches:
                        connector.enroll_browser(Relay(),credentials,status,'fixture')
                        self.assertEqual(json.loads(credentials.read_text())['token'],'token-secret')
                        self.assertNotIn('token-secret',status.read_text())
                        self.assertNotIn('device-secret',status.read_text())
                        self.assertEqual(json.loads(status.read_text())['state'],'connected')
                    else:
                        with self.assertRaisesRegex(ValueError,'PAIRING_BINDING_INVALID'):
                            connector.enroll_browser(Relay(),credentials,status,'fixture')
                        self.assertFalse(credentials.exists())

    def test_expired_enrollment_does_not_write_credentials(self):
        with tempfile.TemporaryDirectory() as folder:
            credentials,status=Path(folder)/'connection.json',Path(folder)/'status.json'
            class Relay:
                origin='https://fixture.invalid'
                def call(self,path,body):
                    return {'user_code':'a'*18,'expires_at':0}
            with self.assertRaisesRegex(ValueError,'PAIRING_EXPIRED'):
                connector.enroll_browser(Relay(),credentials,status,'fixture')
            self.assertFalse(credentials.exists())
            self.assertEqual(json.loads(status.read_text())['state'],'pairing_expired')

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
