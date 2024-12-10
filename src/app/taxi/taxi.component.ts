import { Component } from '@angular/core';
import { taxi, driver } from '../typings';
import { TaxiService } from '../services/taxi.service';

@Component({
  selector: 'app-taxi',
  templateUrl: './taxi.component.html',
  styleUrls: ['./taxi.component.css'],
})
export class TaxiComponent {
  taxiQ: taxi[] = [];
  avtfoto: string = '';

  constructor(private taxiService: TaxiService) {}

  ngOnInit() {
    this.taxiService.getTaxi().subscribe((taxi) => (this.taxiQ = taxi));
  }

 

  setPhoto(name: string): string {
    // return `https://api.multiavatar.com/${name}.png`;
    return `https://ui-avatars.com/api/?name=${name}`;
  }

  deleteTaxi(taxi: taxi) {
    this.taxiService
      .deleteTaxi(taxi)
      .subscribe(
        () => (this.taxiQ = this.taxiQ.filter((t) => t.id !== taxi.id))
      );
  }

  onSelect(taxi: taxi) {
    taxi.selected = true;
    if (taxi.assigned) { taxi.selected = false; }
  }

  deselect(taxi: taxi) {
    taxi.selected = false;
  }

  onTouch(taxi: taxi, event: any) {
    event.preventDefault();
    let tapedTwice = false;
    let timer = 0;

    let tappedTime = Date.now();

    taxi.selected = true;
    if (taxi.assigned) { taxi.selected = false; }

    timer = tappedTime - taxi.selectedTime;
    // console.log(timer);
    if(timer < 300 && timer > 0) {
      taxi.selected = false;
    }
    taxi.selectedTime = tappedTime;
  }

  onAssign(taxi: taxi) {
    taxi.assigned = true;
    this.taxiQ.forEach((t) => {
      if(t.id !== taxi.id) {
        t.selected = false;
      }
    });

    // remove the taxi from the list and put in the bottom of the list
    this.taxiQ = this.taxiQ.filter((t) => t.id !== taxi.id);
    taxi.assigned = false;
    taxi.selected = false;
    this.taxiQ.push(taxi);
    
  //   console.log(taxi);

    

  }



}
