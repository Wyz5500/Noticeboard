/** Exposes versioned task resources while delegating all behavior to application use cases. */
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ApiErrorResponseDto } from '../../common/presentation/api-error-response.dto.js';
import { DemoUserGuard } from '../../identity/presentation/demo-user.guard.js';
import { ActOnTask } from '../application/use-cases/act-on-task.js';
import { CreateTask } from '../application/use-cases/create-task.js';
import { GetTask } from '../application/use-cases/get-task.js';
import { ListTasks } from '../application/use-cases/list-tasks.js';
import { ActTaskDto } from './dto/act-task.dto.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { TaskResponseDto, toTaskResponse } from './dto/task-response.dto.js';

@ApiTags('tasks')
@Controller({ path: 'tasks', version: '1' })
export class TasksController {
  /** Receives the explicit command and query use cases used by this HTTP adapter. */
  constructor(
    private readonly listTasks: ListTasks,
    private readonly getTask: GetTask,
    private readonly createTask: CreateTask,
    private readonly actOnTask: ActOnTask,
  ) {}

  /** Lists all task projections for client-side filtering and statistics. */
  @Get()
  @ApiOkResponse({ type: [TaskResponseDto] })
  async list(): Promise<TaskResponseDto[]> {
    return (await this.listTasks.execute()).map(toTaskResponse);
  }

  /** Returns one complete task projection including its ordered timeline. */
  @Get(':taskId')
  @ApiOkResponse({ type: TaskResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async get(@Param('taskId') taskId: string): Promise<TaskResponseDto> {
    return toTaskResponse(await this.getTask.execute(taskId));
  }

  /** Creates a task as the recognized demo actor from the request header. */
  @Post()
  @UseGuards(DemoUserGuard)
  @ApiSecurity('demo-user')
  @ApiHeader({ name: 'X-Demo-User-Id', required: true })
  @ApiCreatedResponse({ type: TaskResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async create(
    @Headers('x-demo-user-id') actorId: string,
    @Body() body: CreateTaskDto,
  ): Promise<TaskResponseDto> {
    return toTaskResponse(await this.createTask.execute(actorId, body));
  }

  /** Applies one optimistic task action and returns the freshly synchronized projection. */
  @Post(':taskId/actions')
  @HttpCode(200)
  @UseGuards(DemoUserGuard)
  @ApiSecurity('demo-user')
  @ApiHeader({ name: 'X-Demo-User-Id', required: true })
  @ApiOkResponse({ type: TaskResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  async act(
    @Headers('x-demo-user-id') actorId: string,
    @Param('taskId') taskId: string,
    @Body() body: ActTaskDto,
  ): Promise<TaskResponseDto> {
    await this.actOnTask.execute(
      actorId,
      taskId,
      body.action,
      body.expectedVersion,
    );
    return toTaskResponse(await this.getTask.execute(taskId));
  }
}
