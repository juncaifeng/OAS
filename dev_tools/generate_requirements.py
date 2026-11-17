"""Refresh the cross-platform uv lockfile.

Usage:
    python dev_tools/generate_requirements.py

The historical filename is kept for contributor muscle memory. No requirements
files or local distribution artifacts are generated.
"""
import subprocess


if __name__ == "__main__":
    subprocess.run(["uv", "lock"], check=True)
