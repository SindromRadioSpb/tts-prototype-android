-- SQLite before 3.35 cannot drop a column; the compressed bodies are cleared instead.
UPDATE news_harvest_items SET data_gz=NULL;
