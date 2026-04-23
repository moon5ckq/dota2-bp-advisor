/**
 * 数据更新时间底部标签组件
 * 
 * 在页面最底部显示数据的最后更新时间
 * 调用 /api/data-status 获取数据文件更新时间
 */
import { useState, useEffect } from 'react';
import { fetchDataStatus } from '../api';

export default function DataFooter() {
  const [updateTime, setUpdateTime] = useState('');

  useEffect(() => {
    fetchDataStatus()
      .then(res => {
        if (res.overall_updated_at) {
          setUpdateTime(res.overall_updated_at);
        }
      })
      .catch(() => {});
  }, []);

  if (!updateTime) return null;

  return (
    <div className="text-center text-[9px] text-[#8b8fa3]/50 py-2 pb-16">
      数据更新于 {updateTime}
    </div>
  );
}
