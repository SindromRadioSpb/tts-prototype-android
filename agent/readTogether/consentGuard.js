'use strict';
const {CONSENT_VERSION}=require('../access/consentCeremony');
const {consentKey}=require('../access/oauthContracts');

// Connection/grant snapshots do not replace the latest first-party consent.
// Reads only identifiers/status; neither source nor proposal bodies enter SQL/audit.
function createConsentGuard({oauthRepo,getDb}) {
  return async function liveConnection(user,connection,scope) {
    try {
      const c=await oauthRepo.loadConnection(user,connection);
      const client=await oauthRepo.loadClientForAuthorization(c.oauth_client_id);
      if(c.user_id!==user||c.connection_id!==connection||client.status!=='ACTIVE'||!['ACTIVE','SCOPE_REDUCED'].includes(c.status)||c.consent_version!==CONSENT_VERSION||!c.grants.some(g=>g.scope===scope&&g.status==='ACTIVE'&&g.consent_version===CONSENT_VERSION))throw Error('denied');
      const consent=await new Promise((resolve,reject)=>getDb().get(
        'SELECT id,granted,consent_version FROM consent_records WHERE user_id=? AND consent_key=? ORDER BY created_at DESC,rowid DESC LIMIT 1',
        [user,consentKey(connection,scope)],(error,row)=>error?reject(error):resolve(row)));
      if(!consent||Number(consent.granted)!==1||consent.consent_version!==CONSENT_VERSION)throw Error('denied');
      return {authorization_revision:JSON.stringify([c.security_epoch,c.consent_version,consent.id])};
    }catch(_){throw Object.assign(Error('RT_ACCESS_REVOKED'),{code:'RT_ACCESS_REVOKED'});}
  };
}
module.exports={createConsentGuard};
