-- O-175 (2026-11-26): five wave-4 outlets passed their probe from the owner's home PC, but their Cloudflare answers
-- the server's address with 403 on every feed (owner list, last_error BOT_CHALLENGE:HTTP_403, last_ok_at never).
-- The harvester does not get around that check; like C14 they are read by the home PC and handed to the server
-- (scripts/news/install-home-harvest.ps1 -Outlet c14,haipo,colbo,kolhair,geektime,hayadan).
UPDATE news_outlet_state SET route='home_pc', last_error=NULL, last_error_at=NULL
  WHERE outlet_id IN ('haipo','colbo','kolhair','geektime','hayadan') AND route='server';
