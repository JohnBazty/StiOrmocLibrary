# Repository Instructions

Before making design, implementation, or database decisions:

1. Read [docs/source-of-truth.md](docs/source-of-truth.md) and consult its preserved Final Draft and Administrative System Flow PDFs for the relevant feature.
2. Read and follow [agent.md](agent.md).
3. Check the currently implemented schema contract in [docs/schema-context.md](docs/schema-context.md).

The PDFs define the target product. The schema context describes the current database implementation. When they differ, plan a backward-safe migration instead of silently changing table meanings.
