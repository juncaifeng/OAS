# This Python file uses the following encoding: utf-8
# copy from alas https://github.com/LmeSzinc/AzurLaneAutoScript
from deploy.config import DeployConfig
from deploy.logger import logger
from deploy.utils import *


class PipManager(DeployConfig):
    """Legacy installer hook; dependency resolution is delegated to uv."""

    @cached_property
    def uv(self):
        return self.UvExecutable

    def pip_install(self):
        logger.hr('Update Dependencies with uv', 0)
        if not self.InstallDependencies:
            logger.info('InstallDependencies is disabled, skip')
            return

        self.execute(f'"{self.uv}" --version')
        self.execute(f'"{self.uv}" python install 3.10')
        command = f'"{self.uv}" sync --frozen --no-dev'
        if self.PypiMirror:
            command += f' --default-index "{self.PypiMirror}"'
        self.execute(command)
