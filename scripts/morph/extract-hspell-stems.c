/*
 * scripts/morph/extract-hspell-stems.c — v3.3 Workstream A1 Phase 2
 *
 * Dumps every stem from hspell's radix-tree dictionary to stdout, one
 * stem per line. Output is ISO-8859-8 encoded (hspell's native encoding);
 * convert via `iconv -f iso-8859-8 -t utf-8` to get UTF-8 Hebrew.
 *
 * Built as a thin wrapper around hspell's internal print_tree() — same
 * traversal as find_sizes.c upstream but skips the size stats and writes
 * just the words.
 *
 * Build (in WSL Ubuntu with build-essential + hspell-dev installed):
 *   gcc -O2 -o /tmp/extract-hspell-stems \
 *       scripts/morph/extract-hspell-stems.c \
 *       .external/hspell/dict_radix.c \
 *       -I.external/hspell -lz
 *
 * Run (uses the system-installed dictionary at /usr/share/hspell/hebrew.wgz):
 *   /tmp/extract-hspell-stems > /tmp/hspell_stems_iso.txt
 *   iconv -f iso-8859-8 -t utf-8 /tmp/hspell_stems_iso.txt > /tmp/hspell_stems_utf8.txt
 *
 * The resulting file contains ~338K Hebrew stems and is the canonical
 * "comprehensive Hebrew wordlist" input for `npm run build:morphology:full`.
 *
 * License: derived from hspell upstream (AGPL-3.0). See NOTICE.md.
 */

#include <stdio.h>
#include <sys/types.h>
#include <stdlib.h>
#include <string.h>

#include "dict_radix.h"

int
main(int argc, char *argv[])
{
    struct dict_radix *dict = new_dict_radix();
    if (!dict) {
        fprintf(stderr, "extract-hspell-stems: new_dict_radix failed\n");
        return 1;
    }

    /* Same allocation sizes as upstream find_sizes.c. */
    if (allocate_nodes(dict, 200000, 100000, 10000) != 0) {
        fprintf(stderr, "extract-hspell-stems: allocate_nodes failed\n");
        return 2;
    }

    /* read_dict(NULL) reads from compiled-in DICTIONARY_BASE (defaults to
     * the local dir on first try, then $datadir). Easier: take a path on
     * argv[1] if provided. */
    const char *dict_path = (argc > 1) ? argv[1] : "/usr/share/hspell/hebrew.wgz";
    /* read_dict returns 1 on success (per do_read_dict()), 0 on early
     * failures (file-open errors); the convention matches hspell upstream
     * and is intentionally inverted vs. the more common Unix style. */
    if (read_dict(dict, dict_path) == 0) {
        fprintf(stderr, "extract-hspell-stems: read_dict(%s) failed\n", dict_path);
        return 3;
    }

    /* Traverse and emit "word value\n" lines. value is hspell's internal
     * stem id; we discard it in post-processing. */
    print_tree(dict);

    delete_dict_radix(dict);
    return 0;
}
