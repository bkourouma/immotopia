import React from 'react';
import { List, Typography, Avatar, Space } from 'antd';
import { Comment } from '../../types/maintenance-types';
import { formatCompactDate } from '../../utils/date-utils';
import { UserOutlined, CustomerServiceOutlined, RobotOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface CommentThreadProps {
  comments: Comment[];
}

const authorTypeIcons: Record<string, React.ReactNode> = {
  TENANT: <UserOutlined />,
  MANAGER: <CustomerServiceOutlined />,
  SYSTEM: <RobotOutlined />
};

const authorTypeLabels: Record<string, string> = {
  TENANT: 'Locataire',
  MANAGER: 'Gestionnaire',
  SYSTEM: 'Système'
};

export const CommentThread: React.FC<CommentThreadProps> = ({ comments }) => {
  if (comments.length === 0) {
    return <Text type="secondary">Aucun commentaire</Text>;
  }

  return (
    <List
      dataSource={comments}
      renderItem={(comment) => {
        const authorName = comment.authorUser
          ? comment.authorUser.fullName || comment.authorUser.email
          : comment.authorContact
          ? `${comment.authorContact.firstName} ${comment.authorContact.lastName}`
          : authorTypeLabels[comment.authorType] || 'Inconnu';

        const formattedDate = formatCompactDate(comment.createdAt);

        return (
          <List.Item style={{ paddingLeft: 0, paddingRight: 0 }}>
            <List.Item.Meta
              avatar={<Avatar icon={authorTypeIcons[comment.authorType]} />}
              title={
                <Space>
                  <Text strong>{authorName}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {authorTypeLabels[comment.authorType]}
                  </Text>
                </Space>
              }
              description={
                <div>
                  <div style={{ marginBottom: 8 }}>{comment.content}</div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {formattedDate}
                  </Text>
                </div>
              }
            />
          </List.Item>
        );
      }}
    />
  );
};
