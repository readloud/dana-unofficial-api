import { requestOtp } from '../flow.mjs';
const otp = (await requestOtp('081234000000')).otp;
if(!otp) throw new Error('no otp');
console.log('node test OK');
