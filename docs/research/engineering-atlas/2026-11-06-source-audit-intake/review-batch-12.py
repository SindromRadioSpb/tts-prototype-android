"""AA1100 wording: preserve the odd printed phrase, separately explain it."""
import review_tools as R
t=R.current_pages[200]['tables'][0];q=t['cells'][3]
old='עיבוד משמעותי'
assert old in q['he']
R.cell('HE200-F01',3,q['he'].replace(old,'קושי בעיבוד'),q['ru']+' В источнике буквально: «поэтому идеален для применений, в которых возникает трудность обработки» (קושי בעיבוד). Необычная формулировка сохранена; прежнее «значительная обработка» не является буквальным переносом.',0)
R.finish()
