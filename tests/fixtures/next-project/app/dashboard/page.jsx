import { helper } from '../../utils.js';
export default function Dashboard() {
  fetch('/api/users');
  return <div>{helper()}</div>;
}
