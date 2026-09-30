// Shared by src/lib/py-worker.ts (browser) and scripts/validate-content.ts (Node)
// so browser and CI verify Python with identical semantics.
export const PY_RUNNER = `
import ast as _ast
import json as _json

def _missing_calls(_code, _must):
    try:
        _tree = _ast.parse(_code)
    except SyntaxError:
        return []
    _called = set()
    for _n in _ast.walk(_tree):
        if isinstance(_n, _ast.Call):
            _f = _n.func
            if isinstance(_f, _ast.Name):
                _called.add(_f.id)
            elif isinstance(_f, _ast.Attribute):
                _called.add(_f.attr)
    return [_m for _m in _must if _m not in _called]

def _run_exercise(_code, _tests_json, _must_call_json="[]"):
    _missing = _missing_calls(_code, _json.loads(_must_call_json))
    if _missing:
        return _json.dumps({"error": "this exercise requires calling " + ", ".join(_missing) + " in your code"})
    _tests = _json.loads(_tests_json)
    _out = []
    for _t in _tests:
        _ns = {}
        try:
            exec(_code, _ns)
            _setup = _t.get("setup", "")
            if _setup:
                exec(_setup, _ns)
        except Exception as _e:
            _out.append([False, "", "", repr(_e)])
            continue
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
