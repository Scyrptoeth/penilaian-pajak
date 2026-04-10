import { useCallback, useMemo, useState } from 'react';
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
  Panel,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import dagre from 'dagre';
import '@xyflow/react/dist/style.css';

// --- Dark mode detection ---

// Note: useIsDark hook available for future use
// RegulationNode reads document.documentElement.classList directly for simplicity

// --- Types ---

interface RegulationNodeData {
  label: string;
  title: string;
  jenis: string;
  status: string;
  slug: string;
  nodeType: 'regulation';
}

interface CategoryNodeData {
  label: string;
  count: number;
  categoryId: string;
  nodeType: 'category';
}

interface RootNodeData {
  label: string;
  nodeType: 'root';
}

type MindMapNodeData = RegulationNodeData | CategoryNodeData | RootNodeData;

// --- Status colors ---

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

const statusBgDark: Record<string, string> = {
  berlaku: '#052e16',
  dicabut: '#450a0a',
  diubah: '#451a03',
};

// --- Node sizes for dagre ---

const NODE_SIZES = {
  root: { width: 280, height: 70 },
  category: { width: 240, height: 60 },
  regulation: { width: 240, height: 90 },
};

// --- Dagre layout ---

function getLayoutedElements(
  nodes: Node<MindMapNodeData>[],
  edges: Edge[],
): { nodes: Node<MindMapNodeData>[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 220, marginx: 60, marginy: 60 });

  const nodeSet = new Set(nodes.map((n) => n.id));

  nodes.forEach((node) => {
    const size =
      node.data.nodeType === 'root'
        ? NODE_SIZES.root
        : node.data.nodeType === 'category'
          ? NODE_SIZES.category
          : NODE_SIZES.regulation;
    g.setNode(node.id, { width: size.width, height: size.height });
  });

  // Only add edges where both source and target exist in visible nodes
  const visibleEdges = edges.filter((e) => nodeSet.has(e.source) && nodeSet.has(e.target));

  visibleEdges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    const size =
      node.data.nodeType === 'root'
        ? NODE_SIZES.root
        : node.data.nodeType === 'category'
          ? NODE_SIZES.category
          : NODE_SIZES.regulation;
    return {
      ...node,
      position: {
        x: pos.x - size.width / 2,
        y: pos.y - size.height / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges: visibleEdges };
}

// --- Custom Nodes ---

function RootNode({ data }: NodeProps<Node<RootNodeData>>) {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  return (
    <div
      style={{
        background: isDark ? '#ffffff' : '#000000',
        color: isDark ? '#000000' : '#ffffff',
        padding: '16px 24px',
        fontFamily: "'Montserrat', system-ui, sans-serif",
        fontWeight: 700,
        fontSize: 16,
        textAlign: 'center',
        minWidth: NODE_SIZES.root.width,
        border: `2px solid ${isDark ? '#ffffff' : '#000000'}`,
      }}
    >
      {data.label}
      <Handle type="source" position={Position.Right} style={{ background: isDark ? '#000000' : '#ffffff' }} />
    </div>
  );
}

function CategoryNode({ data }: NodeProps<Node<CategoryNodeData>>) {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  return (
    <div
      style={{
        background: isDark ? '#e5e5e5' : '#262626',
        color: isDark ? '#000000' : '#ffffff',
        padding: '12px 20px',
        fontFamily: "'Montserrat', system-ui, sans-serif",
        fontWeight: 700,
        fontSize: 14,
        textAlign: 'center',
        minWidth: NODE_SIZES.category.width,
        border: `2px solid ${isDark ? '#d4d4d4' : '#525252'}`,
        cursor: 'pointer',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: isDark ? '#a3a3a3' : '#525252' }} />
      <div>{data.label}</div>
      <div style={{ fontSize: 11, color: isDark ? '#525252' : '#a3a3a3', marginTop: 4, fontWeight: 400 }}>
        {data.count} peraturan — klik untuk expand
      </div>
      <Handle type="source" position={Position.Right} style={{ background: isDark ? '#a3a3a3' : '#525252' }} />
    </div>
  );
}

function RegulationNode({ data }: NodeProps<Node<RegulationNodeData>>) {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const borderColor = statusBorder[data.status] || '#94a3b8';
  const bgColor = isDark
    ? (statusBgDark[data.status] || '#1e293b')
    : (statusBg[data.status] || '#f8fafc');

  return (
    <div
      style={{
        border: `2px solid ${borderColor}`,
        borderLeftWidth: 5,
        background: bgColor,
        padding: '10px 14px',
        minWidth: NODE_SIZES.regulation.width,
        maxWidth: 280,
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
      <Handle type="target" position={Position.Left} style={{ background: borderColor }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            fontFamily: 'monospace',
            padding: '1px 5px',
            background: '#262626',
            color: '#fff',
          }}
        >
          {data.jenis}
        </span>
        <span style={{ fontSize: 10, fontWeight: 500, textTransform: 'capitalize', color: borderColor }}>
          {data.status}
        </span>
      </div>
      <div style={{ fontWeight: 600, fontSize: 13, fontFamily: 'monospace', color: isDark ? '#f5f5f5' : '#171717' }}>
        {data.label}
      </div>
      <div
        style={{
          fontSize: 11,
          color: isDark ? '#a3a3a3' : '#525252',
          marginTop: 4,
          lineHeight: 1.3,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {data.title.length > 50 ? data.title.slice(0, 50) + '…' : data.title}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: borderColor }} />
    </div>
  );
}

// --- Inner component that can use useReactFlow ---

interface MindMapInnerProps {
  allNodes: Node<MindMapNodeData>[];
  allEdges: Edge[];
}

function MindMapInner({ allNodes, allEdges }: MindMapInnerProps) {
  const { fitView } = useReactFlow();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Filter nodes based on expanded state
  const { visibleNodes, visibleEdges } = useMemo(() => {
    const expandedSet = expanded;
    const filtered = allNodes.filter((node) => {
      if (node.data.nodeType === 'root' || node.data.nodeType === 'category') return true;
      // For regulation nodes, find their parent category edge
      const parentEdge = allEdges.find(
        (e) => e.target === node.id && e.source.startsWith('cat-'),
      );
      if (!parentEdge) return false;
      const catId = parentEdge.source.replace('cat-', '');
      return expandedSet.has(catId);
    });
    return { visibleNodes: filtered, visibleEdges: allEdges };
  }, [allNodes, allEdges, expanded]);

  // Compute layout for visible nodes
  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () => getLayoutedElements(visibleNodes, visibleEdges),
    [visibleNodes, visibleEdges],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  // Sync layout when expanded state changes
  const prevLayout = useMemo(() => JSON.stringify(layoutedNodes.map((n) => n.id)), [layoutedNodes]);
  useState(() => {
    // Initial sync handled by useNodesState
  });

  // Update nodes/edges when layout changes
  useMemo(() => {
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
    // fitView after state update
    setTimeout(() => fitView({ padding: 0.3, duration: 300 }), 50);
  }, [prevLayout]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node<MindMapNodeData>) => {
      if (node.data.nodeType === 'category') {
        const catData = node.data as CategoryNodeData;
        setExpanded((prev) => {
          const next = new Set(prev);
          if (next.has(catData.categoryId)) {
            next.delete(catData.categoryId);
          } else {
            next.add(catData.categoryId);
          }
          return next;
        });
      }
      // Regulation node clicks are handled inside the RegulationNode component
    },
    [],
  );

  const expandAll = useCallback(() => {
    const allCatIds = allNodes
      .filter((n) => n.data.nodeType === 'category')
      .map((n) => (n.data as CategoryNodeData).categoryId);
    setExpanded(new Set(allCatIds));
  }, [allNodes]);

  const collapseAll = useCallback(() => {
    setExpanded(new Set());
  }, []);

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
        minZoom={0.05}
        maxZoom={2}
        attributionPosition="bottom-left"
      >
        <Background gap={20} size={1} />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            const d = node.data as MindMapNodeData;
            if (d.nodeType === 'root') return '#000000';
            if (d.nodeType === 'category') return '#404040';
            return statusBorder[(d as RegulationNodeData).status] || '#a3a3a3';
          }}
          maskColor="rgba(0,0,0,0.08)"
        />
        <Panel position="top-right">
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={expandAll}
              style={{
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 600,
                background: '#ffffff',
                color: '#171717',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Tampilkan Semua
            </button>
            <button
              onClick={collapseAll}
              style={{
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 600,
                background: '#262626',
                color: '#fff',
                border: '1px solid #525252',
                cursor: 'pointer',
              }}
            >
              Sembunyikan Semua
            </button>
          </div>
        </Panel>
      </ReactFlow>
    </>
  );
}

// Node types must be defined outside component to avoid re-creation
const nodeTypes = {
  root: RootNode,
  category: CategoryNode,
  regulation: RegulationNode,
};

// --- Main component (provides ReactFlowProvider) ---

interface MindMapProps {
  initialNodes: Node<MindMapNodeData>[];
  initialEdges: Edge[];
}

export default function MindMap({ initialNodes, initialEdges }: MindMapProps) {
  if (initialNodes.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#737373' }}>
        <p>Mind map akan ditampilkan setelah data peraturan diisi.</p>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <MindMapInner allNodes={initialNodes} allEdges={initialEdges} />
    </ReactFlowProvider>
  );
}
