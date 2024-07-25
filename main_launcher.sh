#!/bin/bash

PYTHON_PATH="./venv/bin/python3"

MAIN_PY_PATH="main.py"

$PYTHON_PATH $MAIN_PY_PATH --preview-method auto --listen 0.0.0.0 --port 47134
