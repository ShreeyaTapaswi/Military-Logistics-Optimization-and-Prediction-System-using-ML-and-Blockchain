import subprocess
from pathlib import Path
from typing import Any, Dict


class MLGateway:
    def __init__(self, pipeline_root: Path, python_executable: str = "python"):
        self.pipeline_root = Path(pipeline_root)
        self.python_executable = python_executable

    def health(self) -> Dict[str, Any]:
        script_path = self.pipeline_root / "run_inference.py"
        return {
            "pipeline_root": str(self.pipeline_root),
            "run_inference_exists": script_path.exists(),
            "python_executable": self.python_executable,
        }

    def run_inference(self, timeout_seconds: int = 1200) -> Dict[str, Any]:
        script_path = self.pipeline_root / "run_inference.py"
        if not script_path.exists():
            return {
                "success": False,
                "message": "run_inference.py not found.",
                "stdout_tail": "",
                "stderr_tail": "",
            }

        command = [
            self.python_executable,
            "-X",
            "utf8",
            str(script_path),
        ]

        try:
            completed = subprocess.run(
                command,
                cwd=str(self.pipeline_root.parent),
                check=False,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
            )
            return {
                "success": completed.returncode == 0,
                "message": "ML inference completed." if completed.returncode == 0 else "ML inference failed.",
                "returncode": completed.returncode,
                "stdout_tail": "\n".join(completed.stdout.splitlines()[-30:]),
                "stderr_tail": "\n".join(completed.stderr.splitlines()[-30:]),
            }
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "message": f"ML inference timed out after {timeout_seconds} seconds.",
                "stdout_tail": "",
                "stderr_tail": "",
            }
