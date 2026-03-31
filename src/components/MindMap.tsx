import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

interface RegulationData {
  label: string;
  title: string;
  jenis: string;
  status: string;
  slug: string;
}

const statusBorder: Record<string, string> = {
  berlaku: '#16a34a',
  dicabut: '#dc2626',
  diubah: '#d97706',
};

const statusBg: Record<string, string> = {
  berlaku: '#f0fdf4',
  dicabut: '#fef2f2',
  diubah: '#fffbeb',
};

function RegulationNode({ data }: NodeProps<Node<RegulationData>>) {
  const borderColor = statusBorder[data.status] || '#94a3b8';
  const bgColor = statusBg[data.status] || '#f8fafc';

  return (
    <div
      style={{
        border: `2px solid ${borderColor}`,
        background: bgColor,
        padding: '10px 14px',
        minWidth: 200,
        maxWidth: 260,
        cursor: 'pointer',
      }}
      onClick={() => {
        window.location.href = `/perpustakaan/${data.slug}`;
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          window.location.href = `/perpustakaan/${data.slug}`;
        }
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: borderColor }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            fontFamily: 'monospace',
            padding: '1px 5px',
            background: '#1e3a5f',
            color: '#fff',
          }}
        >
          {data.jenis}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            textTransform: 'capitalize',
            color: borderColor,
          }}
        >
          {data.status}
        </span>
      </div>
      <div style={{ fontWeight: 600, fontSize: 13, fontFamily: 'monospace', color: '#0a1628' }}>
        {data.label}
      </div>
      <div
        style={{
          fontSize: 11,
          color: '#475569',
          marginTop: 4,
          lineHeight: 1.3,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {data.title}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: borderColor }} />
    </div>
  );
}

interface MindMapProps {
  initialNodes: Node<RegulationData>[];
  initialEdges: Edge[];
}

export default function MindMap({ initialNodes, initialEdges }: MindMapProps) {
  const nodeTypes = useMemo(() => ({ regulation: RegulationNode }), []);
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const onInit = useCallback((instance: { fitView: () => void }) => {
    instance.fitView();
  }, []);

  if (initialNodes.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>
        <p>Mind map akan ditampilkan setelah data peraturan diisi.</p>
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onInit={onInit}
      nodeTypes={nodeTypes}
      fitView
      minZoom={0.2}
      maxZoom={2}
      attributionPosition="bottom-left"
    >
      <Background gap={20} size={1} color="#e2e8f0" />
      <Controls />
      <MiniMap
        nodeColor={(node) => statusBorder[(node.data as RegulationData)?.status] || '#94a3b8'}
        maskColor="rgba(0,0,0,0.1)"
      />
    </ReactFlow>
  );
}
