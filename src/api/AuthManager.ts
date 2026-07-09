/**
 * 文件：src/api/AuthManager.ts
 * 职责：鉴权业务方法集合。每个方法都是对 ApiClient.invokeMethod 的薄封装，
 *       固定服务名为 "Api"、管理器为 "AuthManager"，并返回强类型响应。
 * 依赖：./AppDtos（类型）、./ApiClient（调用封装）
 * 导出：默认对象 { Login, SignUp, SendPasswordResetEmail, ChangePassword,
 *       UpdateUserEmail, UpdateUserPassword, UpdateUserName, GetSession }
 */

import { LoginRequestDto, LoginResponseDto, SignUpRequestDto, SignUpResponseDto, SendPasswordResetRequestDto, OperationResultDto, ChangePasswordRequestDto, UpdateUserEmailDto, UpdateUserEmailResponseDto, UpdateUserNameDto, UpdateUserNameResponseDto, UpdateUserPasswordDto, UpdateUserPasswordResponseDto, GetSessionRequestDto, SessionDto } from "./AppDtos";
import ApiClient from "./ApiClient";

const Login = (request: LoginRequestDto): Promise<LoginResponseDto> =>
  ApiClient.invokeMethod<LoginResponseDto>("Api", "AuthManager", "Login", request);

const SignUp = (request: SignUpRequestDto): Promise<SignUpResponseDto> =>
  ApiClient.invokeMethod<SignUpResponseDto>("Api", "AuthManager", "SignUp", request);

const SendPasswordResetEmail = (request: SendPasswordResetRequestDto): Promise<OperationResultDto> =>
  ApiClient.invokeMethod<OperationResultDto>("Api", "AuthManager", "SendPasswordResetEmail", request);

const ChangePassword = (request: ChangePasswordRequestDto): Promise<OperationResultDto> =>
  ApiClient.invokeMethod<OperationResultDto>("Api", "AuthManager", "ChangePassword", request);

const UpdateUserEmail = (request: UpdateUserEmailDto): Promise<UpdateUserEmailResponseDto> =>
  ApiClient.invokeMethod<UpdateUserEmailResponseDto>("Api", "AuthManager", "UpdateUserEmail", request);

const UpdateUserPassword = (request: UpdateUserPasswordDto): Promise<UpdateUserPasswordResponseDto> =>
  ApiClient.invokeMethod<UpdateUserPasswordResponseDto>("Api", "AuthManager", "UpdateUserPassword", request);

const UpdateUserName = (request: UpdateUserNameDto): Promise<UpdateUserNameResponseDto> =>
  ApiClient.invokeMethod<UpdateUserNameResponseDto>("Api", "AuthManager", "UpdateUserName", request);


const GetSession = (request: GetSessionRequestDto): Promise<SessionDto> =>
  ApiClient.invokeMethod<SessionDto>("Api", "AuthManager", "GetSession", request);

export default {
  Login,
  SignUp,
  SendPasswordResetEmail,
  ChangePassword,
  UpdateUserEmail,
  UpdateUserPassword,
  UpdateUserName,
  GetSession
};
