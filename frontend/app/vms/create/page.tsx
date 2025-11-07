'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, ArrowLeft, Server, Check } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';

interface Plan {
  id: string;
  name: string;
  cpu: number;
  ram: number;
  storage: number;
  price: number;
}

const plans: Plan[] = [
  { id: 'basic', name: 'Basic', cpu: 1, ram: 2, storage: 20, price: 5 },
  { id: 'standard', name: 'Standard', cpu: 2, ram: 4, storage: 40, price: 10 },
  { id: 'premium', name: 'Premium', cpu: 4, ram: 8, storage: 80, price: 20 },
  { id: 'enterprise', name: 'Enterprise', cpu: 8, ram: 16, storage: 160, price: 40 },
];

const operatingSystems = [
  { id: 'ubuntu-22.04', name: 'Ubuntu 22.04 LTS', icon: '🐧' },
  { id: 'ubuntu-20.04', name: 'Ubuntu 20.04 LTS', icon: '🐧' },
  { id: 'debian-11', name: 'Debian 11', icon: '🌀' },
  { id: 'centos-8', name: 'CentOS 8', icon: '💠' },
  { id: 'fedora-38', name: 'Fedora 38', icon: '🎩' },
];

export default function CreateVMPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  
  const [formData, setFormData] = useState({
    name: '',
    plan: '',
    os: '',
    customSpecs: false,
    cpu: 1,
    ram: 2,
    storage: 20,
  });

  const selectedPlan = plans.find(p => p.id === formData.plan);
  const selectedOS = operatingSystems.find(os => os.id === formData.os);

  const calculatePrice = () => {
    if (formData.customSpecs) {
      return formData.cpu * 2.5 + formData.ram * 1.25 + formData.storage * 0.1;
    }
    return selectedPlan?.price || 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.os) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    try {
      setLoading(true);
      const vmData = {
        name: formData.name,
        os: formData.os,
        cpu: formData.customSpecs ? formData.cpu : selectedPlan?.cpu,
        ram: formData.customSpecs ? formData.ram : selectedPlan?.ram,
        storage: formData.customSpecs ? formData.storage : selectedPlan?.storage,
      };

      const response = await apiClient.createVM(vmData);
      
      toast({
        title: 'Success',
        description: 'VM created successfully',
      });
      
      router.push(`/vms/${response.vm.id}`);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create VM',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <Button variant="ghost" asChild className="mb-4">
          <Link href="/vms">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to VMs
          </Link>
        </Button>
        
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary/10 rounded-lg">
            <Server className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Create New VM</h1>
            <p className="text-muted-foreground">
              Configure and deploy a new virtual machine
            </p>
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center flex-1">
              <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                step >= s ? 'border-primary bg-primary text-primary-foreground' : 'border-muted'
              }`}>
                {step > s ? <Check className="h-5 w-5" /> : s}
              </div>
              {s < 3 && (
                <div className={`flex-1 h-1 mx-2 ${
                  step > s ? 'bg-primary' : 'bg-muted'
                }`} />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-sm">Basic Info</span>
          <span className="text-sm">Specifications</span>
          <span className="text-sm">Review</span>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Step 1: Basic Information */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Enter the basic details for your VM</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">VM Name *</Label>
                <Input
                  id="name"
                  placeholder="my-awesome-vm"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
                <p className="text-sm text-muted-foreground">
                  Choose a unique name for your virtual machine
                </p>
              </div>

              <div className="space-y-2">
                <Label>Operating System *</Label>
                <RadioGroup
                  value={formData.os}
                  onValueChange={(value) => setFormData({ ...formData, os: value })}
                >
                  {operatingSystems.map((os) => (
                    <div key={os.id} className="flex items-center space-x-2 border rounded-lg p-4 hover:bg-accent cursor-pointer">
                      <RadioGroupItem value={os.id} id={os.id} />
                      <Label htmlFor={os.id} className="flex items-center gap-3 cursor-pointer flex-1">
                        <span className="text-2xl">{os.icon}</span>
                        <span className="font-medium">{os.name}</span>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={!formData.name || !formData.os}
                >
                  Next
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Specifications */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Specifications</CardTitle>
              <CardDescription>Choose a plan or customize your VM specs</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <Label>Select a Plan</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {plans.map((plan) => (
                    <div
                      key={plan.id}
                      className={`border rounded-lg p-4 cursor-pointer transition-all ${
                        formData.plan === plan.id && !formData.customSpecs
                          ? 'border-primary bg-primary/5'
                          : 'hover:border-primary/50'
                      }`}
                      onClick={() => setFormData({ ...formData, plan: plan.id, customSpecs: false })}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <h3 className="font-semibold text-lg">{plan.name}</h3>
                        <span className="text-2xl font-bold">${plan.price}</span>
                      </div>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <p>• {plan.cpu} vCPU</p>
                        <p>• {plan.ram} GB RAM</p>
                        <p>• {plan.storage} GB Storage</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">per month</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or</span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="custom"
                    checked={formData.customSpecs}
                    onChange={(e) => setFormData({ ...formData, customSpecs: e.target.checked, plan: '' })}
                    className="rounded"
                  />
                  <Label htmlFor="custom" className="cursor-pointer">
                    Customize specifications
                  </Label>
                </div>

                {formData.customSpecs && (
                  <div className="space-y-4 p-4 border rounded-lg">
                    <div className="space-y-2">
                      <Label htmlFor="cpu">CPU Cores: {formData.cpu}</Label>
                      <input
                        type="range"
                        id="cpu"
                        min="1"
                        max="16"
                        value={formData.cpu}
                        onChange={(e) => setFormData({ ...formData, cpu: parseInt(e.target.value) })}
                        className="w-full"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="ram">RAM: {formData.ram} GB</Label>
                      <input
                        type="range"
                        id="ram"
                        min="2"
                        max="64"
                        step="2"
                        value={formData.ram}
                        onChange={(e) => setFormData({ ...formData, ram: parseInt(e.target.value) })}
                        className="w-full"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="storage">Storage: {formData.storage} GB</Label>
                      <input
                        type="range"
                        id="storage"
                        min="20"
                        max="500"
                        step="10"
                        value={formData.storage}
                        onChange={(e) => setFormData({ ...formData, storage: parseInt(e.target.value) })}
                        className="w-full"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-between">
                <Button type="button" variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={() => setStep(3)}
                  disabled={!formData.plan && !formData.customSpecs}
                >
                  Next
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Review & Create</CardTitle>
              <CardDescription>Review your VM configuration before creating</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                  <div>
                    <p className="text-sm text-muted-foreground">VM Name</p>
                    <p className="font-medium">{formData.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Operating System</p>
                    <p className="font-medium">{selectedOS?.name}</p>
                  </div>
                </div>

                <div className="p-4 border rounded-lg">
                  <h3 className="font-semibold mb-3">Specifications</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">CPU</p>
                      <p className="text-lg font-bold">
                        {formData.customSpecs ? formData.cpu : selectedPlan?.cpu} vCPU
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">RAM</p>
                      <p className="text-lg font-bold">
                        {formData.customSpecs ? formData.ram : selectedPlan?.ram} GB
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Storage</p>
                      <p className="text-lg font-bold">
                        {formData.customSpecs ? formData.storage : selectedPlan?.storage} GB
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm text-muted-foreground">Estimated Monthly Cost</p>
                      <p className="text-3xl font-bold">${calculatePrice().toFixed(2)}</p>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <p>Billed monthly</p>
                      <p>Cancel anytime</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-between">
                <Button type="button" variant="outline" onClick={() => setStep(2)}>
                  Back
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create VM'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </form>
    </div>
  );
}
