// Preserve body-read failures: HTTP headers can arrive before a download times out.
export async function readPublicationResponse(response) {
  let json;
  try { json = await response.json(); }
  catch (error) {
    if (error.name !== 'SyntaxError') throw error;
    throw new Error(response.ok ? 'PUBLICATION_RESPONSE_INVALID' : 'HTTP_' + response.status);
  }
  if (!response.ok || json?.ok !== true) throw new Error(json?.error || (response.ok ? 'PUBLICATION_RESPONSE_INVALID' : 'HTTP_' + response.status));
  return json;
}
