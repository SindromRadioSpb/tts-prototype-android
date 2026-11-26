-- Back to the server route (they answer the server with 403 again).
UPDATE news_outlet_state SET route='server' WHERE outlet_id IN ('haipo','colbo','kolhair','geektime','hayadan') AND route='home_pc';
