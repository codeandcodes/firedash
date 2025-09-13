SHELL := /bin/bash

.PHONY: setup dev build preview test lint fmt ci

setup:
	@echo "[setup] Install JS deps (run: npm install)"

dev:
	@npm run dev

build:
	@npm run build

preview:
	@npm run preview

test:
	@npm run test

lint:
	@npm run lint

fmt:
	@npm run fmt

ci:
	@npm run lint && npm run test && npm run build

