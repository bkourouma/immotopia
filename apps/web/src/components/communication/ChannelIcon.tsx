import React from 'react';
import { MailOutlined, MessageOutlined, NotificationOutlined } from '@ant-design/icons';
interface ChannelIconProps {
  channel: string;
  size?: number;
}

const icons: Record<string, React.ReactNode> = {
  EMAIL: <MailOutlined />,
  WHATSAPP: <MessageOutlined />,
  SMS: <NotificationOutlined />
};

export function ChannelIcon({ channel, size = 16 }: ChannelIconProps) {
  const icon = icons[channel] ?? <NotificationOutlined />;
  return <span style={{ fontSize: size }}>{icon}</span>;
}
