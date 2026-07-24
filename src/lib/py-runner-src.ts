// Shared by src/lib/py-worker.ts (browser) and scripts/validate-content.ts (Node)
// so browser and CI verify Python with identical semantics.
export const PY_RUNNER = `
import json as _json

def _run_exercise(_code, _tests_json):
    _base = {}
    exec(_code, _base)
    _tests = _json.loads(_tests_json)
    _out = []
    for _t in _tests:
        _ns = dict(_base)
        _setup = _t.get("setup", "")
        if _setup:
            exec(_setup, _ns)
        _raises = _t.get("raises")
        _expr = _t["expr"]
        if _raises is not None:
            try:
                eval(_expr, _ns)
                _out.append([False, "raises " + _raises, "no error raised", None])
            except Exception as _e:
                _out.append([type(_e).__name__ == _raises, "raises " + _raises, "raises " + type(_e).__name__, None])
        else:
            try:
                _a = eval(_expr, _ns)
                _ex = eval(_t["expect"], _ns)
                _out.append([bool(_a == _ex), repr(_ex), repr(_a), None])
            except Exception as _e:
                _out.append([False, "", "", repr(_e)])
    return _json.dumps(_out)
`
