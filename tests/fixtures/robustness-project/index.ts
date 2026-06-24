import { add } from '@utils/math';
import type { UserInfo } from './types';
import './side-effect.css';

const user: UserInfo = { name: 'Alice' };
console.log(add(1, 2), user);
