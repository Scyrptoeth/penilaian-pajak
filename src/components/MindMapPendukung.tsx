import { useCallback, useEffect, useMemo, useState } from 'react';
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
  diubah: '#2563eb',
};

const statusBg: Record<string, string> = {
  berlaku: '#f0fdf4',
  dicabut: '#fef2f2',
  diubah: '#eff6ff',
};

const statusBgDark: Record<string, string> = {
  berlaku: '#052e16',
  dicabut: '#450a0a',
  diubah: '#172554',
};

// --- Node sizes ---

const NODE_SIZES = {
  root: { width: 300, height: 70 },
  category: { width: 240, height: 60 },
  regulation: { width: 260, height: 80 },
};

// --- Dagre layout ---

function getLayoutedElements(
  nodes: Node<MindMapNodeData>[],
  edges: Edge[],
): { nodes: Node<MindMapNodeData>[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 200, marginx: 60, marginy: 60 });

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

  const visibleEdges = edges.filter((e) => nodeSet.has(e.source) && nodeSet.has(e.target));
  visibleEdges.forEach((edge) => g.setEdge(edge.source, edge.target));
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
      position: { x: pos.x - size.width / 2, y: pos.y - size.height / 2 },
    };
  });

  return { nodes: layoutedNodes, edges: visibleEdges };
}

// --- Custom Nodes ---

function RootNode({ data }: NodeProps<Node<RootNodeData>>) {
  return (
    <div style={{ background: '#052240', color: '#ffca19', padding: '16px 24px', fontFamily: "'Space Grotesk', system-ui", fontWeight: 700, fontSize: 16, textAlign: 'center', minWidth: NODE_SIZES.root.width, border: '2px solid #ffca19' }}>
      {data.label}
      <Handle type="source" position={Position.Right} style={{ background: '#ffca19' }} />
    </div>
  );
}

function CategoryNode({ data }: NodeProps<Node<CategoryNodeData>>) {
  return (
    <div style={{ background: '#02275d', color: '#fff', padding: '12px 20px', fontFamily: "'Space Grotesk', system-ui", fontWeight: 600, fontSize: 13, textAlign: 'center', minWidth: NODE_SIZES.category.width, border: '2px solid #1a5090', cursor: 'pointer' }}>
      <Handle type="target" position={Position.Left} style={{ background: '#1a5090' }} />
      <div>{data.label}</div>
      <div style={{ fontSize: 11, color: '#c9a84c', marginTop: 4, fontWeight: 400 }}>{data.count} peraturan — klik untuk expand</div>
      <Handle type="source" position={Position.Right} style={{ background: '#1a5090' }} />
    </div>
  );
}

function RegulationNode({ data }: NodeProps<Node<RegulationNodeData>>) {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const borderColor = statusBorder[data.status] || '#6b7280';
  const bgColor = isDark ? (statusBgDark[data.status] || '#1e293b') : (statusBg[data.status] || '#f8fafc');
  const textColor = isDark ? '#e7e5e4' : '#1e3a5f';

  return (
    <div
      style={{ background: bgColor, border: `2px solid ${borderColor}`, borderLeftWidth: 5, padding: '10px 14px', minWidth: NODE_SIZES.regulation.width, maxWidth: 280, cursor: 'pointer' }}
      onClick={() => window.open(`/peraturan-pendukung/${data.jenis.toLowerCase()}/${data.slug}`, '_self')}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') window.open(`/peraturan-pendukung/${data.jenis.toLowerCase()}/${data.slug}`, '_self'); }}
    >
      <Handle type="target" position={Position.Left} style={{ background: borderColor }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 600, fontFamily: 'monospace', padding: '1px 5px', background: '#02275d', color: '#fff' }}>{data.jenis}</span>
        <span style={{ fontSize: 10, fontWeight: 500, textTransform: 'capitalize', color: borderColor }}>{data.status}</span>
      </div>
      <div style={{ fontWeight: 600, fontSize: 12, fontFamily: 'monospace', color: textColor }}>{data.label}</div>
      <div style={{ fontSize: 11, color: isDark ? '#a8a29e' : '#475569', marginTop: 4, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
        {data.title.length > 60 ? data.title.slice(0, 60) + '…' : data.title}
      </div>
    </div>
  );
}

const nodeTypes = { root: RootNode, category: CategoryNode, regulation: RegulationNode };

// --- Inner component ---

interface MindMapInnerProps {
  allNodes: Node<MindMapNodeData>[];
  allEdges: Edge[];
}

function MindMapInner({ allNodes, allEdges }: MindMapInnerProps) {
  const { fitView } = useReactFlow();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Filter visible nodes based on expanded state
  const { visibleNodes, visibleEdges } = useMemo(() => {
    const filtered = allNodes.filter((node) => {
      if (node.data.nodeType === 'root' || node.data.nodeType === 'category') {
        // Category nodes: show if parent is root (always) or parent category is expanded
        const parentEdge = allEdges.find((e) => e.target === node.id);
        if (!parentEdge) return true; // root has no parent edge
        if (parentEdge.source === 'root') return true; // top-level categories always visible
        // Sub-categories: visible if parent category is expanded
        const parentCatId = parentEdge.source.replace('cat-', '');
        return expanded.has(parentCatId);
      }
      // Regulation nodes: visible if parent category is expanded
      const parentEdge = allEdges.find((e) => e.target === node.id);
      if (!parentEdge) return false;
      const parentCatId = parentEdge.source.replace('cat-', '');
      return expanded.has(parentCatId);
    });
    return getLayoutedElements(filtered, allEdges);
  }, [allNodes, allEdges, expanded]);

  const [nodes, setNodes, onNodesChange] = useNodesState(visibleNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(visibleEdges);

  // Sync nodes/edges when layout changes — useEffect, NOT useMemo
  const layoutKey = useMemo(() => visibleNodes.map((n) => n.id).join(','), [visibleNodes]);

  useEffect(() => {
    setNodes(visibleNodes);
    setEdges(visibleEdges);
    const timer = setTimeout(() => fitView({ padding: 0.3, duration: 300 }), 50);
    return () => clearTimeout(timer);
  }, [layoutKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
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
  }, []);

  const expandAll = useCallback(() => {
    const allCatIds = allNodes
      .filter((n) => n.data.nodeType === 'category')
      .map((n) => (n.data as CategoryNodeData).categoryId);
    setExpanded(new Set(allCatIds));
  }, [allNodes]);

  const collapseAll = useCallback(() => setExpanded(new Set()), []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
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
        nodeColor={(n) => {
          const d = n.data as MindMapNodeData;
          if (d.nodeType === 'root') return '#ffca19';
          if (d.nodeType === 'category') return '#02275d';
          return statusBorder[(d as RegulationNodeData).status] || '#6b7280';
        }}
        maskColor="rgba(10,22,40,0.15)"
      />
      <Panel position="top-right">
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={expandAll} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, background: '#ffca19', color: '#052240', border: 'none', cursor: 'pointer' }}>
            Tampilkan Semua
          </button>
          <button onClick={collapseAll} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, background: '#02275d', color: '#fff', border: '1px solid #1a5090', cursor: 'pointer' }}>
            Sembunyikan Semua
          </button>
        </div>
      </Panel>
    </ReactFlow>
  );
}

// --- Main export ---

interface MindMapPendukungProps {
  initialNodes: Node<MindMapNodeData>[];
  initialEdges: Edge[];
}

export default function MindMapPendukung({ initialNodes, initialEdges }: MindMapPendukungProps) {
  if (initialNodes.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>
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
